import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// 偽の Claude：割り込みツールを1回使ってから返事をする（1回 = $0.03）
const create = vi.fn();
const requests: { model: string; fallbacks?: unknown; betas?: string[]; messages: { content: unknown }[] }[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        create: (params: unknown) => {
          requests.push(structuredClone(params) as (typeof requests)[number]);
          return create(params);
        },
      },
    };
  },
}));

const { MemoryCalendar } = await import("@/lib/calendar/memory");
const { MemoryStore } = await import("@/lib/store/memory");
let userId = "";
vi.mock("@/lib/context", () => ({
  getUserContext: async () => ({ userId, calendar: new MemoryCalendar(userId), store: new MemoryStore() }),
}));
const { POST } = await import("@/app/api/chat/route");

const tz = "Asia/Tokyo";
const usage = { input_tokens: 5000, output_tokens: 500 };
const toolUse = {
  model: "claude-opus-5-5",
  stop_reason: "tool_use",
  usage,
  content: [{ type: "tool_use", id: "t1", name: "interrupt", input: { title: "買い物", minutes: 45, start: "now", mode: "slide" } }],
};
const done = { model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: "買い物を割り込ませました" }] };

const send = async (body: Record<string, unknown>) => {
  const res = await POST(new Request("http://x/api/chat", { method: "POST", body: JSON.stringify({ tz, ...body }) }) as unknown as NextRequest);
  return { status: res.status, data: await res.json() };
};
const cost = () => new MemoryStore().getCost(userId, "2026-10-28");
const savedMessages = () => new MemoryStore().recentMessages(userId, 10);

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-28T13:05:00+09:00"));
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  userId = crypto.randomUUID();
  create.mockReset();
  requests.length = 0;
  create.mockResolvedValueOnce(toolUse).mockResolvedValueOnce(done);
});

const interrupt = { start: "now", mode: "slide" };

describe("POST /api/chat の割り込みモード", () => {
  it("節約モードで長さが読める文は、AI を使わずに処理する（使用量は増えない）", async () => {
    const { data } = await send({ message: "45分買い物", interrupt, aiMode: "save" });
    expect(create).not.toHaveBeenCalled();
    expect(data).toMatchObject({ local: true, changes: { created: 1 } });
    expect(data.reply).toContain("13:15-14:00 に「買い物」を割り込ませました");
    expect(data.opId).toBeTruthy();
    expect(await cost()).toBe(0);
    expect((await savedMessages()).map((m) => m.content)).toEqual(["⚡割り込み：45分買い物", data.reply]);
  });

  it("節約モードでも、長さが読めない文は AI に頼む（使用量が増える）", async () => {
    const { data } = await send({ message: "ちょっとコンビニ", interrupt, aiMode: "save" });
    expect(create).toHaveBeenCalledTimes(2);
    expect(data.local).toBeUndefined();
    expect(String(requests[0].messages.at(-1)!.content)).toContain("［割り込みモード］");
    expect(await cost()).toBeCloseTo(0.06, 10);
  });

  it("強化モードでは、読める文でも毎回 AI を使う（使用量が増える）", async () => {
    const { data } = await send({ message: "45分買い物", interrupt, aiMode: "boost" });
    expect(create).toHaveBeenCalledTimes(2);
    expect(data.reply).toBe("買い物を割り込ませました");
    expect(data.changes.created).toBe(1);
    expect(await cost()).toBeCloseTo(0.06, 10);
    expect((await savedMessages())[0].content).toBe("⚡割り込み：45分買い物");
  });

  it("割り込みモードでなければ、割り込みの指示は付けない", async () => {
    await send({ message: "45分買い物", aiMode: "boost" });
    expect(create).toHaveBeenCalledTimes(2);
    expect(String(requests[0].messages.at(-1)!.content)).not.toContain("［割り込みモード］");
  });
});

describe("POST /api/chat の節約モード／強化モード（すべてのチャット）", () => {
  it("節約モード：決まった形の依頼は AI を使わずに処理する（使用量は増えない）", async () => {
    const { data } = await send({ message: "14時から要件定義1時間", aiMode: "save" });
    expect(create).not.toHaveBeenCalled();
    expect(data).toMatchObject({ local: true, reply: "14:00-15:00 に「要件定義」を入れました。", changes: { created: 1 } });
    expect(await cost()).toBe(0);
    expect((await savedMessages()).map((m) => m.content)).toEqual(["14時から要件定義1時間", data.reply]);
  });

  it("節約モード：「割り込み30分」は、選んだ開始・後ろの予定の扱いで割り込ませる", async () => {
    const { data } = await send({ message: "割り込み30分", aiMode: "save", interruptPrefs: { start: "now", mode: "trim" } });
    expect(create).not.toHaveBeenCalled();
    expect(data.reply).toContain("13:15-13:45 に「割り込み」を割り込ませました。\n重なる予定はありませんでした。");
  });

  it("節約モード：読めない依頼は AI に頼む（使用量が増える）", async () => {
    create.mockReset();
    create.mockResolvedValueOnce(done);
    const { data } = await send({ message: "今日の残りを組み直して", aiMode: "save" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(data.local).toBeUndefined();
    expect(await cost()).toBeCloseTo(0.03, 10);
  });

  it("強化モード：決まった形の依頼でも AI が考える（使用量が増える）", async () => {
    create.mockReset();
    create.mockResolvedValueOnce(done);
    await send({ message: "14時から要件定義1時間", aiMode: "boost" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(await cost()).toBeCloseTo(0.03, 10);
  });
});

describe("AI の使い方ごとのモデル", () => {
  const reply = { model: "x", stop_reason: "end_turn", usage, content: [{ type: "text", text: "了解" }] };

  it.each([
    ["save", "ちょっとコンビニ", "claude-haiku-5-5", "Haiku"],
    ["save", "今日の残りを組み直して", "claude-sonnet-5-5", "Sonnet"],
    ["normal", "ちょっとコンビニ", "claude-haiku-5-5", "Haiku"],
    ["normal", "直近2週間の時間の使い方を分析して", "claude-sonnet-5-5", "Sonnet"],
    ["boost", "ちょっとコンビニ", "claude-sonnet-5-5", "Sonnet"],
    ["max", "ちょっとコンビニ", "claude-opus-5-5", "Opus"],
  ])("%s「%s」→ %s", async (aiMode, message, model, label) => {
    create.mockReset();
    create.mockResolvedValue(reply);
    const { data } = await send({ message, aiMode });
    expect(requests[0].model).toBe(model);
    expect(data.model).toBe(label);
  });

  it("通常モードでは、決まった形の依頼でも AI（Haiku）が考える", async () => {
    create.mockReset();
    create.mockResolvedValue(reply);
    const { data } = await send({ message: "14時から要件定義1時間", aiMode: "normal" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(requests[0].model).toBe("claude-haiku-5-5");
    expect(data.local).toBeUndefined();
  });
});

describe("Haiku へのリクエスト", () => {
  it("Haiku には断られたときの代わりのモデル（fallbacks）を付けない。Sonnet・Opus には付ける", async () => {
    const reply = { model: "x", stop_reason: "end_turn", usage, content: [{ type: "text", text: "了解" }] };
    create.mockReset();
    create.mockResolvedValue(reply);
    await send({ message: "ちょっとコンビニ", aiMode: "save" });
    await send({ message: "ちょっとコンビニ", aiMode: "boost" });
    expect(requests[0]).not.toHaveProperty("fallbacks");
    expect(requests[0]).not.toHaveProperty("betas");
    expect(requests[1]).toMatchObject({ fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
  });
});

describe("最大モード（Opus）", () => {
  it("考える量を増やし（effort high）、振り返り・分析の指示を持っている", async () => {
    const reply = { model: "x", stop_reason: "end_turn", usage, content: [{ type: "text", text: "分析しました" }] };
    create.mockReset();
    create.mockResolvedValue(reply);
    await send({ message: "直近2週間の時間の使い方を分析して", aiMode: "max" });
    await send({ message: "直近2週間の時間の使い方を分析して", aiMode: "boost" });
    const calls = create.mock.calls.map((c) => c[0]);
    expect(calls[0]).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "high" } });
    expect(calls[1]).toMatchObject({ model: "claude-sonnet-5-5", output_config: { effort: "medium" } });
    expect(JSON.stringify(calls[0].system)).toContain("振り返り・分析");
  });
});

describe("ストイックの返事の口調", () => {
  it("AI には、毎回のメッセージに「口調: ストイック（コーチ）」を付ける。system は口調で変えない（キャッシュが効く）", async () => {
    const reply = { model: "x", stop_reason: "end_turn", usage, content: [{ type: "text", text: "入れた。" }] };
    create.mockReset();
    requests.length = 0;
    create.mockResolvedValue(reply);
    await send({ message: "ちょっとコンビニ", aiMode: "normal", tone: "stoic" });
    await send({ message: "ちょっとコンビニ", aiMode: "normal" });
    // 呼んだ時点のリクエスト（requests は呼んだときの複製）
    const [stoic, soft] = requests as unknown as { system: unknown; messages: { content: unknown }[] }[];
    expect(String(stoic.messages.at(-1)!.content)).toContain("口調: ストイック（コーチ）");
    expect(String(soft.messages.at(-1)!.content)).not.toContain("口調: ストイック");
    expect(JSON.stringify(stoic.system)).toBe(JSON.stringify(soft.system));
    expect(JSON.stringify(stoic.system)).toContain("敬語（です・ます・ください）は使わない");
  });

  it("アプリが処理する返事（節約モード）もストイックの口調になる", async () => {
    const { data } = await send({ message: "14時から要件定義1時間", aiMode: "save", tone: "stoic" });
    expect(data.reply).toBe("14:00-15:00 に「要件定義」を入れた。始めたら、終わるまで離れるな。");
  });
});

describe("カスタム指示", () => {
  it("AI を使うときは毎回 system の後ろに付ける（共通の指示のキャッシュはそのまま）。アプリで処理するときは使わない", async () => {
    const reply = { model: "x", stop_reason: "end_turn", usage, content: [{ type: "text", text: "了解" }] };
    create.mockReset();
    create.mockResolvedValue(reply);
    requests.length = 0;
    await new MemoryStore().saveCustomInstructions(userId, "22時以降は予定を入れないで");
    await send({ message: "ちょっとコンビニ", aiMode: "normal" });
    const system = (requests[0] as unknown as { system: { text: string; cache_control?: unknown }[] }).system;
    expect(system).toHaveLength(2);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[1].text).toContain("22時以降は予定を入れないで");
    expect(system[1]).not.toHaveProperty("cache_control");

    // 節約モードでアプリが処理する依頼は AI を呼ばない
    create.mockClear();
    await send({ message: "14時から要件定義1時間", aiMode: "save" });
    expect(create).not.toHaveBeenCalled();
  });

  it("指示がなければ system は1つのまま", async () => {
    const reply = { model: "x", stop_reason: "end_turn", usage, content: [{ type: "text", text: "了解" }] };
    create.mockReset();
    create.mockResolvedValue(reply);
    requests.length = 0;
    await send({ message: "ちょっとコンビニ", aiMode: "normal" });
    expect((requests[0] as unknown as { system: unknown[] }).system).toHaveLength(1);
  });
});
