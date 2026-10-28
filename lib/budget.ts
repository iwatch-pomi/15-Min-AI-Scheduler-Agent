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
 * 1回の依頼を始める前に、先に予算から押さえておく額（米ドル）。
 * 同時にたくさん送られても（連打・スクリプト）、押さえた分が合計に入るので、
 * 予算を大きく超えて AI を呼ぶことはない。終わったら実際の費用との差を戻す
 */
export const RESERVE_USD = 0.05;

/**
 * Claude を使う処理は必ずこれで包む。
 * 1. 今日の予算から RESERVE_USD を先に押さえる。押さえる前の時点で使い切っていたら
 *    押さえた分を戻して BudgetExceededError（AI は呼ばない）
 * 2. fn に meter を渡して実行する（Claude は lib/claude.ts の createMessage(meter, …) で呼ぶ）
 * 3. 成功しても失敗しても、実際にかかった費用との差を記録する（押さえた分は必ず精算する）
 */
export async function withAiBudget<T>(
  ctx: { store: Store; userId: string; tz: string; now?: Date },
  fn: (meter: CostMeter) => Promise<T>,
): Promise<BudgetedResult<T>> {
  const date = localDateString(ctx.now ?? new Date(), ctx.tz);
  // 足し算はデータベースの中で1回で行う（同時に来た依頼どうしでも数え漏れがない）
  const reserved = await ctx.store.addCost(ctx.userId, date, RESERVE_USD);
  const before = reserved - RESERVE_USD;
  if (usageOf(before).exhausted) {
    await ctx.store.addCost(ctx.userId, date, -RESERVE_USD).catch(() => {});
    throw new BudgetExceededError(usageOf(before));
  }
  await ctx.store.incrementUsage(ctx.userId, date);

  const meter = new CostMeter();
  let settled = false;
  const settle = async (): Promise<number> => {
    settled = true;
    return ctx.store.addCost(ctx.userId, date, meter.usd - RESERVE_USD).catch((err) => {
      console.error("AI の費用を記録できませんでした（schema.sql の更新が必要かもしれません）", err);
      return before + meter.usd;
    });
  };
  try {
    const result = await fn(meter);
    const total = await settle();
    return { result, usage: usageOf(total), costPercent: percentOfBudget(meter.usd) };
  } finally {
    // 途中で失敗しても、AI を呼んだ分は必ず数え、押さえた分との差を精算する
    if (!settled) await settle();
  }
}
