import { describe, expect, it } from "vitest";
import { percentOfBudget, usageOf } from "@/lib/limits";
import { CostMeter, costUsd } from "@/lib/pricing";
import { MemoryStore } from "@/lib/store/memory";

describe("料金の計算", () => {
  it("入力・出力・キャッシュの書き込み・読み込みを、モデルの単価で計算する", () => {
    // Opus 5.5：入力 $4、出力 $20、キャッシュ読み込み $0.20（100万トークンあたり）
    const usd = costUsd("claude-opus-5-5", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 2000,
      cache_read_input_tokens: 10000,
    });
    expect(usd).toBeCloseTo((1000 * 4 + 2000 * 4 * 1.25 + 10000 * 0.2 + 500 * 20) / 1e6, 10);
  });

  it("表にないモデルは高めに見積もり、usage が無ければ 0", () => {
    expect(costUsd("claude-future-9", { input_tokens: 1_000_000 })).toBe(10);
    expect(costUsd("claude-opus-5-5", undefined)).toBe(0);
  });

  it("1回の依頼の中の、何回かのやり取りを足し合わせる", () => {
    const m = new CostMeter();
    m.add("claude-opus-5-5", { input_tokens: 1_000_000 });
    m.add("claude-sonnet-5-5", { output_tokens: 100_000 });
    expect(m.usd).toBeCloseTo(4 + 1, 10);
  });
});

describe("1日・1か月の予算と残り％", () => {
  const spent = (dayUsd: number, monthUsd = dayUsd) => ({ dayUsd, monthUsd });

  it("有料2は1日 $0.50。使った費用に応じて残り％が減り、使い切ると止まる", () => {
    expect(usageOf(spent(0), "pro")).toEqual({ remainingPercent: 100, exhausted: false, reason: null, monthRemainingPercent: 100, plan: "pro" });
    expect(usageOf(spent(0.14), "pro").remainingPercent).toBe(72);
    expect(usageOf(spent(0.4999), "pro").remainingPercent).toBe(1);
    expect(usageOf(spent(0.5), "pro")).toMatchObject({ remainingPercent: 0, exhausted: true, reason: "day" });
    expect(usageOf(spent(0.7), "pro")).toMatchObject({ remainingPercent: 0, exhausted: true });
  });

  it("残りは、今日と今月の少ないほう。今月を使い切ったら理由は今月", () => {
    // 有料1：1日 $0.10・月 $1.2
    expect(usageOf(spent(0.02, 0.9), "plus")).toMatchObject({ remainingPercent: 25, monthRemainingPercent: 25, exhausted: false });
    expect(usageOf(spent(0.06, 0.06), "plus")).toMatchObject({ remainingPercent: 40, monthRemainingPercent: 95 });
    expect(usageOf(spent(0, 1.2), "plus")).toMatchObject({ remainingPercent: 0, exhausted: true, reason: "month" });
    // 両方を超えていたら、今月を先に出す（明日になっても戻らないため）
    expect(usageOf(spent(0.1, 1.3), "plus").reason).toBe("month");
  });

  it("無料は1日 $0.05。1回の依頼の割合も、プランの1日の予算に対して出す", () => {
    expect(usageOf(spent(0.025), "free").remainingPercent).toBe(50);
    expect(percentOfBudget(0.01, "free")).toBe(20);
    expect(percentOfBudget(0.034, "pro")).toBe(6.8);
  });

  it("費用は日付ごとに足していく", async () => {
    const store = new MemoryStore();
    const user = crypto.randomUUID();
    expect(await store.getCost(user, "2026-10-28")).toBe(0);
    await store.addCost(user, "2026-10-28", 0.1);
    expect(await store.addCost(user, "2026-10-28", 0.05)).toBeCloseTo(0.15, 10);
    expect(await store.getCost(user, "2026-10-29")).toBe(0);
  });

  it("月の合計は、その月の日の分だけを足す", async () => {
    const store = new MemoryStore();
    const user = crypto.randomUUID();
    await store.addCost(user, "2026-09-30", 1);
    await store.addCost(user, "2026-10-01", 0.2);
    await store.addCost(user, "2026-10-31", 0.3);
    await store.addCost(crypto.randomUUID(), "2026-10-15", 5);
    expect(await store.getMonthCost(user, "2026-10")).toBeCloseTo(0.5, 10);
    expect(await store.getMonthCost(user, "2026-11")).toBe(0);
  });
});
