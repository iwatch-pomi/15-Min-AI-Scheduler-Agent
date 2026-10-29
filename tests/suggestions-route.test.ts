import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// 偽の Claude：おすすめの JSON を返す
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

const { MemoryCalendar } = await import("@/lib/calendar/memory");
const { MemoryStore } = await import("@/lib/store/memory");
let userId = "";
let plan: "free" | "plus" | "pro" = "pro";
vi.mock("@/lib/context", () => ({
  getUserContext: async () => ({ userId, calendar: new MemoryCalendar(userId), store: new MemoryStore(), plan }),
}));
const { GET, POST } = await import("@/app/api/suggestions/route");

const tz = "Asia/Tokyo";
const answer = (text: string) => ({
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  usage: { input_tokens: 1000, output_tokens: 200 },
  content: [{ type: "text", text: JSON.stringify({ suggestions: [{ icon: "calendar", text, prompt: "15:00から60分、課題を入れて" }] }) }],
});
const post = async (body: Record<string, unknown>) => {
  const res = await POST(new Request("http://x/api/suggestions", { method: "POST", body: JSON.stringify({ tz, ...body }) }) as unknown as NextRequest);
  return { status: res.status, data: await res.json() };
};
const get = async (query: string) => {
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest(`http://x/api/suggestions?${query}`));
  return res.json();
};

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-28T13:05:00+09:00"));
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  userId = crypto.randomUUID();
  plan = "pro";
  create.mockReset();
});

describe("AI のおすすめ（AIブリーフ）の保存", () => {
  it("AI で作ったものを保存し、あとから読める（Web を閉じても・ほかの端末でも）", async () => {
    expect(await get("date=2026-10-28&tone=stoic")).toEqual({ brief: null, briefsLeft: null });
    create.mockResolvedValueOnce(answer("15:00–16:00 が空いている。タスクを積め。"));
    const { data } = await post({ date: "2026-10-28", tone: "stoic" });
    expect(data.suggestions[0].text).toBe("15:00–16:00 が空いている。タスクを積め。");

    const saved = await get("date=2026-10-28&tone=stoic");
    expect(saved.brief).toMatchObject({ items: data.suggestions, costPercent: data.costPercent, at: data.at });
    // 読むだけなら AI は使わない
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("更新したら新しいものに置き換える。口調（デザイン）ごとに別々に保存する", async () => {
    create.mockResolvedValueOnce(answer("古いブリーフ")).mockResolvedValueOnce(answer("新しいブリーフ")).mockResolvedValueOnce(answer("やさしいおすすめ"));
    await post({ date: "2026-10-28", tone: "stoic" });
    await post({ date: "2026-10-28", tone: "stoic" });
    await post({ date: "2026-10-28", tone: "soft" });
    expect((await get("date=2026-10-28&tone=stoic")).brief.items[0].text).toBe("新しいブリーフ");
    expect((await get("date=2026-10-28&tone=soft")).brief.items[0].text).toBe("やさしいおすすめ");
    expect((await get("date=2026-10-29&tone=stoic")).brief).toBeNull();
  });

  it("AI の使い方（モード）に関係なく、いつも Sonnet で作る", async () => {
    create.mockResolvedValue(answer("x"));
    for (const aiMode of ["save", "normal", "boost", "max"]) await post({ date: "2026-10-28", aiMode });
    await post({ date: "2026-10-28" });
    expect(create.mock.calls.map((c) => c[0].model)).toEqual(Array(5).fill("claude-sonnet-5-5"));
  });

  it("カスタム指示があれば、おすすめを作るときにも渡す", async () => {
    await new MemoryStore().saveCustomInstructions(userId, "朝は勉強を優先して");
    create.mockResolvedValueOnce(answer("x"));
    await post({ date: "2026-10-28" });
    expect(create.mock.calls[0][0].system).toContain("朝は勉強を優先して");
  });

  it("7日より前の日付のものは消す", async () => {
    const store = new MemoryStore();
    await store.saveBrief(userId, { date: "2026-10-01", tone: "soft", items: [], costPercent: 0, createdAt: "" }, "2026-09-01");
    create.mockResolvedValueOnce(answer("今日の分"));
    await post({ date: "2026-10-28", tone: "soft" });
    expect(await store.getBrief(userId, "2026-10-01", "soft")).toBeNull();
  });
});

describe("無料プランの「AIで更新」は1日1回", () => {
  // 無料の1日の予算（$0.05）に収まるよう、安い答えにする
  const cheap = { ...answer("x"), usage: { input_tokens: 100, output_tokens: 20 } };

  it("1回目は作れ、2回目は AI を呼ばずに 429。明日になればまた使える", async () => {
    plan = "free";
    create.mockResolvedValue(cheap);
    expect((await get("date=2026-10-28&tz=Asia/Tokyo")).briefsLeft).toBe(1);
    const first = await post({ date: "2026-10-28" });
    expect(first.status).toBe(200);
    expect(first.data.briefsLeft).toBe(0);
    expect((await get("date=2026-10-28&tz=Asia/Tokyo")).briefsLeft).toBe(0);

    // 口調や日付を変えても、1日1回
    const second = await post({ date: "2026-10-29", tone: "stoic" });
    expect(second.status).toBe(429);
    expect(second.data.error).toContain("1日1回");
    expect(create).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-29T08:00:00+09:00"));
    try {
      expect((await post({ date: "2026-10-29" })).status).toBe(200);
    } finally {
      vi.setSystemTime(new Date("2026-10-28T13:05:00+09:00"));
    }
  });

  it("同時に押しても、AI を呼ぶのは1回だけ", async () => {
    plan = "free";
    create.mockResolvedValue(cheap);
    const results = await Promise.all([post({ date: "2026-10-28" }), post({ date: "2026-10-28" }), post({ date: "2026-10-28" })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 429, 429]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("AI のおすすめを作れなかったときは、数えた1回を戻す", async () => {
    plan = "free";
    create.mockResolvedValueOnce({ ...cheap, content: [{ type: "text", text: "壊れた答え" }] });
    const failed = await post({ date: "2026-10-28" });
    expect(failed.status).toBe(502);
    expect((await get("date=2026-10-28&tz=Asia/Tokyo")).briefsLeft).toBe(1);
  });

  it("有料プランは回数の制限なし", async () => {
    plan = "plus";
    create.mockResolvedValue(cheap);
    for (let i = 0; i < 3; i++) expect((await post({ date: "2026-10-28" })).status).toBe(200);
    expect((await get("date=2026-10-28&tz=Asia/Tokyo")).briefsLeft).toBeNull();
  });
});
