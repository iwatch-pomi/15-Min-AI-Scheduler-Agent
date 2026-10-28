import { percentOfBudget, usageOf, type Usage } from "./limits";
import { CostMeter } from "./pricing";
import type { Store } from "./store/types";
import { localDateString } from "./time";

/** 今日の予算を使い切っているときに投げる（AI は呼ばない） */
export class BudgetExceededError extends Error {
  constructor(public usage: Usage) {
    super("今日のAIの利用上限に達しました。明日の0時にもとに戻ります");
  }
}

export type BudgetedResult<T> = { result: T; usage: Usage; costPercent: number };

/**
 * Claude を使う処理は必ずこれで包む。
 * 1. 今日の予算が残っているか確かめる（なければ BudgetExceededError。AI は呼ばない）
 * 2. fn に meter を渡して実行する（Claude は lib/claude.ts の createMessage(meter, …) で呼ぶ）
 * 3. 成功しても失敗しても、かかった費用を記録する
 */
export async function withAiBudget<T>(
  ctx: { store: Store; userId: string; tz: string; now?: Date },
  fn: (meter: CostMeter) => Promise<T>,
): Promise<BudgetedResult<T>> {
  const date = localDateString(ctx.now ?? new Date(), ctx.tz);
  const spent = await ctx.store.getCost(ctx.userId, date);
  if (usageOf(spent).exhausted) throw new BudgetExceededError(usageOf(spent));
  await ctx.store.incrementUsage(ctx.userId, date);

  const meter = new CostMeter();
  let recorded = false;
  const record = async (): Promise<number> => {
    recorded = true;
    return ctx.store.addCost(ctx.userId, date, meter.usd).catch((err) => {
      console.error("AI の費用を記録できませんでした（schema.sql の更新が必要かもしれません）", err);
      return spent + meter.usd;
    });
  };
  try {
    const result = await fn(meter);
    const total = await record();
    return { result, usage: usageOf(total), costPercent: percentOfBudget(meter.usd) };
  } finally {
    // 途中で失敗しても、AI を呼んだ分は必ず数える
    if (!recorded && meter.usd > 0) await record();
  }
}
