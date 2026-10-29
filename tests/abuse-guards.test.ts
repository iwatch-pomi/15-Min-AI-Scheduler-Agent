import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// 悪用・異常な費用を止める仕組み（lib/guards.ts・lib/budget.ts・lib/claude.ts）
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

const { MemoryCalendar } = await import("@/lib/calendar/memory");
const { MemoryStore } = await import("@/lib/store/memory");
let userId = "";
let plan: "free" | "plus" | "standard" | "pro" = "free";
vi.mock("@/lib/context", () => ({
  getUserContext: async () => ({ userId, calendar: new MemoryCalendar(userId), store: new MemoryStore(), plan, accountTz: "Asia/Tokyo" }),
}));
const { POST: suggest } = await import("@/app/api/suggestions/route");
const { withAiBudget } = await import("@/lib/budget");
const { createMessage } = await import("@/lib/claude");
const { AiPausedError, RATE_LIMITS, RateLimitError, checkGlobalLimit, globalLimits, rateLimit } = await import("@/lib/guards");
const { CostMeter, TimeUpError } = await import("@/lib/pricing");

const answer = {
  model: "claude-haiku-5-5",
  stop_reason: "end_turn",
  usage: { input_tokens: 100, output_tokens: 20 },
  content: [{ type: "text", text: JSON.stringify({ suggestions: [{ icon: "calendar", text: "x", prompt: "y" }] }) }],
};
const reply = { model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 5000, output_tokens: 500 }, content: [{ type: "text", text: "ok" }] };
const call = (meter: InstanceType<typeof CostMeter>, model = "claude-opus-5-5") => createMessage(meter, { model, max_tokens: 1000, messages: [{ role: "user", content: "x" }] });

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-28T13:05:00+09:00"));
afterAll(() => vi.useRealTimers());
afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  userId = crypto.randomUUID();
  plan = "free";
  create.mockReset();
});

describe("画面から送るタイムゾーンを変えても、上限は増えない", () => {
  it("「AIで更新」の1日1回は、アカウントのタイムゾーンの日付で数える（tz を変えて2回目を使えない）", async () => {
    create.mockResolvedValue(answer);
    const post = (tz: string) =>
      suggest(new Request("http://x/api/suggestions", { method: "POST", body: JSON.stringify({ date: "2026-10-28", tz }) }) as unknown as NextRequest);
    expect((await post("Asia/Tokyo")).status).toBe(200);
    // 日本の 10/28 13:05 は、サモアでは 10/27。前は、これで「別の日」として2回目を使えた
    expect((await post("Pacific/Pago_Pago")).status).toBe(429);
    expect((await post("Pacific/Kiritimati")).status).toBe(429);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("短い時間に送れる回数", () => {
  it("決まった回数を超えたら断る。ほかの人・ほかの種類は数えない", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < RATE_LIMITS.chat.max; i++) await rateLimit(store, userId, "chat");
    await expect(rateLimit(store, userId, "chat")).rejects.toBeInstanceOf(RateLimitError);
    await expect(rateLimit(store, crypto.randomUUID(), "chat")).resolves.toBeUndefined();
    await expect(rateLimit(store, userId, "write")).resolves.toBeUndefined();
  });

  it("区切りの時間がたてば、また送れる", async () => {
    const store = new MemoryStore();
    for (let i = 0; i <= RATE_LIMITS.chat.max; i++) await rateLimit(store, userId, "chat").catch(() => {});
    vi.setSystemTime(new Date("2026-10-28T13:06:01+09:00"));
    try {
      await expect(rateLimit(store, userId, "chat")).resolves.toBeUndefined();
    } finally {
      vi.setSystemTime(new Date("2026-10-28T13:05:00+09:00"));
    }
  });

  it("AI を使う依頼も数える（鍵を待つ依頼を大量に送られても、データベースを埋めさせない）", async () => {
    create.mockResolvedValue(reply);
    const store = new MemoryStore();
    for (let i = 0; i < RATE_LIMITS.ai.max; i++) await rateLimit(store, userId, "ai");
    await expect(withAiBudget({ store, userId, tz: "Asia/Tokyo", plan: "pro" }, async (meter) => call(meter))).rejects.toBeInstanceOf(RateLimitError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("全員の AI の費用の、1日の上限（最後の安全装置）", () => {
  const storeWith = (all: number, free: number) => Object.assign(new MemoryStore(), { getTotalCost: async () => ({ all, free }) });

  it("決めなければ全員 $50・無料 $5。環境変数で変えられ、off で上限なし", () => {
    expect(globalLimits({})).toEqual({ all: 50, free: 5 });
    expect(globalLimits({ AI_DAILY_LIMIT_USD: "100", AI_FREE_DAILY_LIMIT_USD: "off" })).toEqual({ all: 100, free: Infinity });
    expect(globalLimits({ AI_DAILY_LIMIT_USD: "abc", AI_FREE_DAILY_LIMIT_USD: "-1" })).toEqual({ all: 50, free: 5 });
  });

  it("全員の合計が上限に達したら、どのプランも AI を止める", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(checkGlobalLimit(storeWith(50, 0), "pro", "2026-10-28")).rejects.toBeInstanceOf(AiPausedError);
    await expect(checkGlobalLimit(storeWith(49, 0), "pro", "2026-10-28")).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("無料の人の合計が上限に達したら、無料プランだけ止める", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(checkGlobalLimit(storeWith(10, 5), "free", "2026-10-28")).rejects.toBeInstanceOf(AiPausedError);
    await expect(checkGlobalLimit(storeWith(10, 5), "plus", "2026-10-28")).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("止めているときは AI を呼ばず、予算も押さえない", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = storeWith(60, 0);
    await expect(withAiBudget({ store, userId, tz: "Asia/Tokyo", plan: "pro" }, async (meter) => call(meter))).rejects.toBeInstanceOf(AiPausedError);
    expect(create).not.toHaveBeenCalled();
    expect(await store.getCost(userId, "2026-10-28")).toBe(0);
    spy.mockRestore();
  });
});

describe("費用は AI を呼ぶたびに記録する（途中で打ち切られても残る）", () => {
  it("依頼が終わる前に、呼んだ分がもう記録されている", async () => {
    create.mockResolvedValue(reply); // $0.03
    const store = new MemoryStore();
    let during = 0;
    await withAiBudget({ store, userId, tz: "Asia/Tokyo", plan: "pro" }, async (meter) => {
      await call(meter);
      during = await store.getCost(userId, "2026-10-28");
    });
    // 押さえた $0.05 ＋ 呼んだ $0.03
    expect(during).toBeCloseTo(0.08, 10);
    expect(await store.getCost(userId, "2026-10-28")).toBeCloseTo(0.03, 10);
  });

  it("返事を待つ途中で切れた（タイムアウト・通信の切断）ときは、最悪の費用で数える", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" }));
    const meter = new CostMeter(1);
    await expect(call(meter, "claude-sonnet-5-5")).rejects.toThrow("timed out");
    // 返事 1000 トークン × $10/100万 ＋ 入力の見積もり
    expect(meter.usd).toBeGreaterThan(0.01);
  });

  it("エラーの返事（費用がかからない）は数えない。混み合っていれば1回だけやり直す", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("overloaded"), { status: 529 })).mockResolvedValueOnce(reply);
    const meter = new CostMeter(1);
    await call(meter);
    expect(create).toHaveBeenCalledTimes(2);
    expect(meter.usd).toBeCloseTo(0.03, 10);

    create.mockReset();
    create.mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));
    const meter2 = new CostMeter(1);
    await expect(call(meter2)).rejects.toThrow("bad request");
    expect(create).toHaveBeenCalledTimes(1);
    expect(meter2.usd).toBe(0);
  });

  it("サーバーの実行時間の上限に近ければ、AI を呼ばない。呼ぶときは、上限の前に待ち終える", async () => {
    const late = new CostMeter(1, undefined, Date.now() + 5000);
    await expect(call(late)).rejects.toBeInstanceOf(TimeUpError);
    expect(create).not.toHaveBeenCalled();

    create.mockResolvedValue(reply);
    await call(new CostMeter(1, undefined, Date.now() + 30_000));
    expect(create.mock.calls[0][1]).toMatchObject({ timeout: 28_000, maxRetries: 0 });
  });
});
