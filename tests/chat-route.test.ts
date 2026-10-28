import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// 偽の Claude：割り込みツールを1回使ってから返事をする（1回 = $0.03）
const create = vi.fn();
const requests: { model: string; messages: { content: unknown }[] }[] = [];
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
    ["save", "claude-sonnet-5-5"],
    ["normal", "claude-sonnet-5-5"],
    ["boost", "claude-opus-5-5"],
  ])("%s → %s", async (aiMode, model) => {
    create.mockReset();
    create.mockResolvedValue(reply);
    await send({ message: "今日の残りを組み直して", aiMode });
    expect(requests[0].model).toBe(model);
  });

  it("通常モードでは、決まった形の依頼でも AI（Sonnet）が考える", async () => {
    create.mockReset();
    create.mockResolvedValue(reply);
    const { data } = await send({ message: "14時から要件定義1時間", aiMode: "normal" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(requests[0].model).toBe("claude-sonnet-5-5");
    expect(data.local).toBeUndefined();
  });
});
