import { afterEach, describe, expect, it } from "vitest";
import { percentOfBudget, usageOf } from "@/lib/limits";
import { CostMeter, costUsd } from "@/lib/pricing";
import { MemoryStore } from "@/lib/store/memory";

afterEach(() => {
  delete process.env.DAILY_AI_BUDGET_USD;
});

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

describe("1日の予算と残り％", () => {
  it("既定は $0.50。使った費用に応じて残り％が減り、使い切ると止まる", () => {
    expect(usageOf(0)).toEqual({ remainingPercent: 100, exhausted: false });
    expect(usageOf(0.14)).toEqual({ remainingPercent: 72, exhausted: false });
    expect(usageOf(0.4999)).toEqual({ remainingPercent: 1, exhausted: false });
    expect(usageOf(0.5)).toEqual({ remainingPercent: 0, exhausted: true });
    expect(usageOf(0.7)).toEqual({ remainingPercent: 0, exhausted: true });
  });

  it("予算は環境変数で変えられ、1回の依頼の割合も出せる", () => {
    process.env.DAILY_AI_BUDGET_USD = "1";
    expect(usageOf(0.25).remainingPercent).toBe(75);
    expect(percentOfBudget(0.034)).toBe(3.4);
  });

  it("費用は日付ごとに足していく", async () => {
    const store = new MemoryStore();
    const user = crypto.randomUUID();
    expect(await store.getCost(user, "2026-10-28")).toBe(0);
    await store.addCost(user, "2026-10-28", 0.1);
    expect(await store.addCost(user, "2026-10-28", 0.05)).toBeCloseTo(0.15, 10);
    expect(await store.getCost(user, "2026-10-29")).toBe(0);
  });
});
