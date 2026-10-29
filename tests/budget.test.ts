import { beforeEach, describe, expect, it, vi } from "vitest";

// Claude API の偽物：呼ばれるたびに決まったトークン数を返す
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

const { BudgetExceededError, withAiBudget } = await import("@/lib/budget");
const { createMessage } = await import("@/lib/claude");
const { generateSuggestions, describeDay } = await import("@/lib/ai-suggest");
const { MemoryStore } = await import("@/lib/store/memory");

const tz = "Asia/Tokyo";
const date = "2026-10-28";
const now = new Date(`${date}T15:00:00+09:00`);
// 1回 = 入力 5000 + 出力 500 トークン（Opus 5.5）= $0.03
const reply = (text: string) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 5000, output_tokens: 500 }, content: [{ type: "text", text }] });
const call = (meter: Parameters<typeof createMessage>[0]) => createMessage(meter, { max_tokens: 10, messages: [{ role: "user", content: "x" }] });

let store: InstanceType<typeof MemoryStore>;
let userId: string;
beforeEach(() => {
  create.mockReset();
  store = new MemoryStore();
  userId = crypto.randomUUID();
});

describe("withAiBudget", () => {
  it("Claude を使った分を必ず記録し、残り％を返す", async () => {
    create.mockResolvedValue(reply("ok"));
    const r = await withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => (await call(meter), "done"));
    expect(r.result).toBe("done");
    expect(await store.getCost(userId, date)).toBeCloseTo(0.03, 10);
    expect(r.usage.remainingPercent).toBe(94); // $0.50 中 $0.03
    expect(r.costPercent).toBe(6);
  });

  it("途中で失敗しても、それまでに Claude を使った分は記録する", async () => {
    create.mockResolvedValueOnce(reply("ok"));
    await expect(
      withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => {
        await call(meter);
        throw new Error("途中で失敗");
      }),
    ).rejects.toThrow("途中で失敗");
    expect(await store.getCost(userId, date)).toBeCloseTo(0.03, 10);
  });

  it("同時にたくさん送られても、予算を大きく超えて Claude を呼ばない", async () => {
    create.mockResolvedValue(reply("ok"));
    await store.addCost(userId, date, 0.44);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => (await call(meter), "done"))),
    );
    // 先に押さえた分（$0.05）が合計に入るので、残り $0.06 では2件まで
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof BudgetExceededError)).toHaveLength(8);
    expect(create).toHaveBeenCalledTimes(2);
    // 押さえた分は精算され、実際の費用だけが残る
    expect(await store.getCost(userId, date)).toBeCloseTo(0.5, 10);
  });

  it("予算を使い切っていたら Claude を呼ばない", async () => {
    await store.addCost(userId, date, 0.5);
    await expect(withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => call(meter))).rejects.toBeInstanceOf(BudgetExceededError);
    expect(create).not.toHaveBeenCalled();
    // 押さえた分は戻す
    expect(await store.getCost(userId, date)).toBeCloseTo(0.5, 10);
  });
});

describe("月の上限とプラン", () => {
  it("今月の予算を使い切っていたら、今日の分が残っていても Claude を呼ばない（理由は今月）", async () => {
    // 有料2：月 $4.5。月のはじめの日にたくさん使った
    await store.addCost(userId, "2026-10-01", 4.5);
    const err = await withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => call(meter)).catch((e) => e);
    expect(err).toBeInstanceOf(BudgetExceededError);
    expect(err.usage).toMatchObject({ exhausted: true, reason: "month" });
    expect(err.message).toContain("今月");
    expect(create).not.toHaveBeenCalled();
    // 押さえた分は戻す
    expect(await store.getCost(userId, date)).toBeCloseTo(0, 10);
  });

  it("先月の分は数えない", async () => {
    create.mockResolvedValue(reply("ok"));
    await store.addCost(userId, "2026-09-30", 4.5);
    const r = await withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => (await call(meter), "done"));
    expect(r.usage.monthRemainingPercent).toBe(99); // $4.5 中 $0.03
  });

  it("今日の上限のときは、理由は今日", async () => {
    await store.addCost(userId, date, 0.5);
    const err = await withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => call(meter)).catch((e) => e);
    expect(err.usage.reason).toBe("day");
    expect(err.message).toContain("今日");
  });

  it("無料プランは1日 $0.05 まで。1回使うと残りが減り、同時に送っても2回目は止まる", async () => {
    create.mockResolvedValue(reply("ok")); // 1回 $0.03
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => withAiBudget({ store, userId, tz, now, plan: "free" }, async (meter) => (await call(meter), "done"))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
    const ok = results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ usage: { remainingPercent: number }; costPercent: number }>;
    // $0.05 中 $0.03（小数の誤差で 39 になることがある）
    expect([39, 40]).toContain(ok.value.usage.remainingPercent);
    expect(ok.value.costPercent).toBe(60);
  });

  it("同時にたくさん送られても、月の予算を大きく超えない", async () => {
    create.mockResolvedValue(reply("ok"));
    // 今月はほかの日に $4.44 使っている（残り $0.06）
    await store.addCost(userId, "2026-10-02", 4.44);
    await Promise.allSettled(
      Array.from({ length: 10 }, () => withAiBudget({ store, userId, tz, now, plan: "pro" }, async (meter) => (await call(meter), "done"))),
    );
    expect(create.mock.calls.length).toBeLessThanOrEqual(2);
    expect(await store.getMonthCost(userId, "2026-10")).toBeLessThanOrEqual(4.5 + 1e-9);
  });
});

describe("AIのおすすめ", () => {
  const events = [
    { id: "1", title: "授業", start: `${date}T00:00:00.000Z`, end: `${date}T01:30:00.000Z`, ai: false, location: "B棟" },
    { id: "2", title: "ジム", start: `${date}T10:00:00.000Z`, end: `${date}T11:00:00.000Z`, ai: true, routine: true },
  ];

  it("予定と空き時間を短い文章にして渡す", () => {
    const text = describeDay({ date, tz, now, today: date, events });
    expect(text).toContain("10月28日(水)（今日・現在 15:00）");
    expect(text).toContain("09:00-10:30 授業（メイン（動かせない）・B棟）");
    expect(text).toContain("19:00-20:00 ジム（ルーティン）");
    expect(text).toContain("15:00-19:00（240分）");
  });

  it("ストイックのときは、コーチの口調の指示を足す", async () => {
    create.mockResolvedValue(reply(JSON.stringify({ suggestions: [] })));
    await withAiBudget({ store, userId, tz, now, plan: "pro" }, (meter) => generateSuggestions(meter, { date, tz, now, today: date, events, tone: "stoic" }));
    await withAiBudget({ store, userId, tz, now, plan: "pro" }, (meter) => generateSuggestions(meter, { date, tz, now, today: date, events }));
    expect(create.mock.calls[0][0].system).toContain("口調（ストイック）");
    expect(create.mock.calls[0][0].system).toContain("敬語（です・ます・ください）は使わない");
    expect(create.mock.calls[1][0].system).not.toContain("口調（ストイック）");
  });

  it("Claude の答え（JSON）から最大3件を作り、費用も記録する", async () => {
    const json = JSON.stringify({
      suggestions: [
        { icon: "calendar", text: "15時から空いています。課題を進めませんか？", prompt: "15:00から90分、課題を入れて" },
        { icon: "leaf", text: "ジムの前に軽く休憩を。", prompt: "18:30から15分の休憩を入れて" },
        { icon: "bulb", text: "明日の準備を。", prompt: "明日の準備を30分入れて" },
        { icon: "bulb", text: "4つ目", prompt: "x" },
      ],
    });
    create.mockResolvedValue(reply(json));
    const r = await withAiBudget({ store, userId, tz, now, plan: "pro" }, (meter) => generateSuggestions(meter, { date, tz, now, today: date, events }));
    expect(r.result.map((s) => s.prompt)).toEqual(["15:00から90分、課題を入れて", "18:30から15分の休憩を入れて", "明日の準備を30分入れて"]);
    expect(create.mock.calls[0][0].output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
    expect(await store.getCost(userId, date)).toBeGreaterThan(0);
  });
});
