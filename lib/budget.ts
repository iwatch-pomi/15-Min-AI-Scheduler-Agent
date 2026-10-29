import { percentOfBudget, usageOf, type Usage } from "./limits";
import type { Plan } from "./plans";
import { CostMeter } from "./pricing";
import type { Store } from "./store/types";
import { localDateString, monthOf } from "./time";

/** 今日か今月の予算を使い切っているときに投げる（AI は呼ばない） */
export class BudgetExceededError extends Error {
  constructor(public usage: Usage) {
    super(
      usage.reason === "month"
        ? "今月のAIの利用上限に達しました。来月1日の0時にもとに戻ります"
        : "今日のAIの利用上限に達しました。明日の0時にもとに戻ります",
    );
  }
}

export type BudgetedResult<T> = { result: T; usage: Usage; costPercent: number };

/**
 * 1回の依頼を始める前に、先に予算から押さえておく額（米ドル）。
 * 同時にたくさん送られても（連打・スクリプト）、押さえた分が合計に入るので、
 * 予算を大きく超えて AI を呼ぶことはない。終わったら実際の費用との差を戻す
 */
export const RESERVE_USD = 0.05;

/** 今日と今月に使った費用（画面に残りを出すとき。AI は使わない） */
export async function currentUsage(ctx: { store: Store; userId: string; tz: string; now?: Date; plan: Plan }): Promise<Usage> {
  const date = localDateString(ctx.now ?? new Date(), ctx.tz);
  const [dayUsd, monthUsd] = await Promise.all([ctx.store.getCost(ctx.userId, date), ctx.store.getMonthCost(ctx.userId, monthOf(date))]);
  return usageOf({ dayUsd, monthUsd }, ctx.plan);
}

/**
 * Claude を使う処理は必ずこれで包む。
 * 1. 今日の予算から RESERVE_USD を先に押さえる。押さえる前の時点で、今日か今月の予算を
 *    使い切っていたら、押さえた分を戻して BudgetExceededError（AI は呼ばない）
 * 2. fn に meter を渡して実行する（Claude は lib/claude.ts の createMessage(meter, …) で呼ぶ）
 * 3. 成功しても失敗しても、実際にかかった費用との差を記録する（押さえた分は必ず精算する）
 */
export async function withAiBudget<T>(
  ctx: { store: Store; userId: string; tz: string; now?: Date; plan: Plan },
  fn: (meter: CostMeter) => Promise<T>,
): Promise<BudgetedResult<T>> {
  const { store, userId, plan } = ctx;
  const date = localDateString(ctx.now ?? new Date(), ctx.tz);
  const month = monthOf(date);
  // 足し算はデータベースの中で1回で行う（同時に来た依頼どうしでも数え漏れがない）
  const reserved = await store.addCost(userId, date, RESERVE_USD);
  // 今月の合計は、押さえた分を足したあとに読む（同時に来たほかの依頼が押さえた分も入る）
  const monthReserved = await store.getMonthCost(userId, month).catch(async (err) => {
    await store.addCost(userId, date, -RESERVE_USD).catch(() => {});
    throw err;
  });
  const before = usageOf({ dayUsd: reserved - RESERVE_USD, monthUsd: monthReserved - RESERVE_USD }, plan);
  if (before.exhausted) {
    await store.addCost(userId, date, -RESERVE_USD).catch(() => {});
    throw new BudgetExceededError(before);
  }
  await store.incrementUsage(userId, date);

  const meter = new CostMeter();
  let settled = false;
  const settle = async (): Promise<number> => {
    settled = true;
    return store.addCost(userId, date, meter.usd - RESERVE_USD).catch((err) => {
      console.error("AI の費用を記録できませんでした（schema.sql の更新が必要かもしれません）", err);
      return reserved - RESERVE_USD + meter.usd;
    });
  };
  // 精算のあとの残り。今月の分は、押さえた時点の合計に実際の費用との差を足して出す
  const after = (dayUsd: number) => usageOf({ dayUsd, monthUsd: monthReserved - RESERVE_USD + meter.usd }, plan);
  try {
    const result = await fn(meter);
    const total = await settle();
    return { result, usage: after(total), costPercent: percentOfBudget(meter.usd, plan) };
  } finally {
    // 途中で失敗しても、AI を呼んだ分は必ず数え、押さえた分との差を精算する
    if (!settled) await settle();
  }
}
