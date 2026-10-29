import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// 1人が同時に送れる AI の依頼は1つまで・1回の依頼は予算の残りに入る分だけ（lib/budget.ts・lib/claude.ts）
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

const { AiBusyError, LOCK_WAIT, withAiBudget } = await import("@/lib/budget");
const { createMessage } = await import("@/lib/claude");
const { runAgent } = await import("@/lib/agent");
const { MemoryCalendar } = await import("@/lib/calendar/memory");
const { RecordingCalendar } = await import("@/lib/ops");
const { CostMeter, MIN_OUTPUT_TOKENS, OverBudgetError, estimateInputTokens, fitMaxTokens } = await import("@/lib/pricing");
const { MemoryStore } = await import("@/lib/store/memory");

const tz = "Asia/Tokyo";
const date = "2026-10-28";
const now = new Date(`${date}T15:00:00+09:00`);
// 1回 = 入力 5000 + 出力 500 トークン（Opus 5.5）= $0.03
const reply = { model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 5000, output_tokens: 500 }, content: [{ type: "text", text: "ok" }] };
const call = (meter: InstanceType<typeof CostMeter>, model = "claude-opus-5-5", max_tokens = 16000) =>
  createMessage(meter, { model, max_tokens, messages: [{ role: "user", content: "x" }] });

const wait = { ...LOCK_WAIT };
beforeAll(() => Object.assign(LOCK_WAIT, { intervalMs: 5, tries: 400 }));
afterAll(() => Object.assign(LOCK_WAIT, wait));

let store: InstanceType<typeof MemoryStore>;
let userId: string;
beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue(reply);
  store = new MemoryStore();
  userId = crypto.randomUUID();
});

describe("同時に送れる AI の依頼は1人1つまで", () => {
  it("同時に送られても、前の依頼が終わってから次を始める（重ならない）", async () => {
    const log: string[] = [];
    const job = (name: string) =>
      withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => {
        log.push(`${name}:start`);
        await call(meter);
        await new Promise((r) => setTimeout(r, 20));
        log.push(`${name}:end`);
      });
    await Promise.all([job("a"), job("b"), job("c")]);
    for (let i = 0; i < log.length; i += 2) expect(log[i].replace("start", "end")).toBe(log[i + 1]);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("ほかの人の依頼は待たない", async () => {
    const other = crypto.randomUUID();
    await store.acquireAiLock(userId, "held", 90);
    await expect(withAiBudget({ store, userId: other, tz, now, plan: "pro" }, async (meter) => (await call(meter), "done"))).resolves.toMatchObject({ result: "done" });
  });

  it("待っても前の依頼が終わらなければ、AI を呼ばずに断る（予算も押さえない）", async () => {
    Object.assign(LOCK_WAIT, { tries: 3 });
    try {
      await store.acquireAiLock(userId, "held", 90);
      await expect(withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => call(meter))).rejects.toBeInstanceOf(AiBusyError);
      expect(create).not.toHaveBeenCalled();
      expect(await store.getCost(userId, date)).toBe(0);
    } finally {
      Object.assign(LOCK_WAIT, { tries: 400 });
    }
  });

  it("失敗しても鍵は外す。外し忘れた鍵は、期限を過ぎれば取り直せる", async () => {
    await expect(withAiBudget({ store, userId, tz, now, plan: "pro" }, async () => Promise.reject(new Error("失敗")))).rejects.toThrow("失敗");
    expect(await store.acquireAiLock(userId, "next", 90)).toBe(true);
    // 持っている間は取れない。ほかの token では外れない
    expect(await store.acquireAiLock(userId, "a", 90)).toBe(false);
    await store.releaseAiLock(userId, "other");
    expect(await store.acquireAiLock(userId, "a", 90)).toBe(false);
    await store.releaseAiLock(userId, "next");
    // 期限0秒の鍵（すぐに期限切れ）は、外さなくても次が取れる
    expect(await store.acquireAiLock(userId, "c", 0)).toBe(true);
    expect(await store.acquireAiLock(userId, "d", 90)).toBe(true);
  });

  it("鍵を使えないとき（表がまだ無いなど）は、AI が使えなくならないよう通す", async () => {
    const broken = Object.assign(new MemoryStore(), { acquireAiLock: () => Promise.reject(new Error("relation ai_locks does not exist")) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(withAiBudget({ store: broken, userId, tz, now, plan: "pro" }, async (meter) => (await call(meter), "done"))).resolves.toMatchObject({ result: "done" });
    spy.mockRestore();
  });
});

describe("1回の依頼は、予算の残りに入る分だけ AI を呼ぶ", () => {
  it("返事の長さの上限を、最悪の費用が残りに入るまで下げる", () => {
    // Sonnet：出力 $10 / 100万トークン。残り $0.10、入力 2000 トークン（書き込み 1.25倍で $0.005）
    expect(fitMaxTokens("claude-sonnet-5-5", 2000, 16000, 0.1)).toBe(9500);
    // 余裕があれば、頼んだ長さのまま
    expect(fitMaxTokens("claude-sonnet-5-5", 2000, 16000, 1)).toBe(16000);
    // 短い返事（1024 トークン）も入らなければ断る
    expect(() => fitMaxTokens("claude-opus-5-5", 2000, 16000, 0.01)).toThrow(OverBudgetError);
    // もともと短い返事を頼むときは、その長さが入ればよい
    expect(fitMaxTokens("claude-haiku-5-5", 100, 300, 0.001)).toBe(300);
    expect(MIN_OUTPUT_TOKENS).toBe(1024);
  });

  it("入力の見積もりは多め（日本語は1字1.5トークン、見えない分も足す）", () => {
    expect(estimateInputTokens("あいう")).toBeGreaterThanOrEqual(1500 + 4);
    expect(estimateInputTokens({ a: "x".repeat(1000) })).toBeGreaterThan(1500 + 700);
  });

  it("残りに合わせて短くした長さで AI を呼び、最悪の費用も今日の残りに入る", async () => {
    await store.addCost(userId, date, 0.42); // プロの1日 $0.50 の残り $0.08
    await withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => call(meter, "claude-sonnet-5-5"));
    const max = create.mock.calls[0][0].max_tokens;
    expect(max).toBeLessThan(16000);
    expect((max * 10) / 1_000_000).toBeLessThanOrEqual(0.08);
  });

  it("今月の残りのほうが少なければ、そちらに合わせる", async () => {
    await store.addCost(userId, "2026-10-02", 4.48); // プロの1か月 $4.5 の残り $0.02
    await withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => call(meter, "claude-sonnet-5-5"));
    expect((create.mock.calls[0][0].max_tokens * 10) / 1_000_000).toBeLessThanOrEqual(0.02);
  });

  it("残りが短い返事にも足りなければ、AI を呼ばない（押さえた分も戻す）", async () => {
    await store.addCost(userId, date, 0.49);
    await expect(withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => call(meter))).rejects.toBeInstanceOf(OverBudgetError);
    expect(create).not.toHaveBeenCalled();
    expect(await store.getCost(userId, date)).toBeCloseTo(0.49, 10);
  });

  it("チャットの途中で残りが足りなくなったら、そこで止め、それまでの変更は残す", async () => {
    create.mockReset();
    create.mockResolvedValueOnce({
      model: "claude-sonnet-5-5",
      stop_reason: "tool_use",
      // $0.05 使う
      usage: { input_tokens: 0, output_tokens: 5000 },
      content: [{ type: "tool_use", id: "t1", name: "create_blocks", input: { blocks: [{ title: "勉強", start: "2026-10-26T14:00+09:00", minutes: 60, energy: "HIGH" }] } }],
    });
    const calendar = new RecordingCalendar(new MemoryCalendar(crypto.randomUUID()));
    const meter = new CostMeter(0.06);
    const { reply: text } = await runAgent({ message: "14時から勉強", history: [], calendar, tz, now: new Date("2026-10-26T04:00:00Z"), meter, model: "claude-sonnet-5-5" });
    expect(text).toContain("途中で止めました");
    expect(calendar.ops).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("短くした長さで返事が切れたら、そこで止める", async () => {
    create.mockReset();
    create.mockResolvedValueOnce({ model: "claude-sonnet-5-5", stop_reason: "max_tokens", usage: { input_tokens: 10, output_tokens: 10 }, content: [] });
    const calendar = new RecordingCalendar(new MemoryCalendar(crypto.randomUUID()));
    const { reply: text } = await runAgent({ message: "x", history: [], calendar, tz, now, meter: new CostMeter(1), model: "claude-sonnet-5-5" });
    expect(text).toContain("途中で止めました");
  });
});
