import { checkGlobalLimit, rateLimit } from "./guards";
import { percentOfBudget, usageOf, type Usage } from "./limits";
import { PLANS, type Plan } from "./plans";
import { CostMeter } from "./pricing";
import type { Store } from "./store/types";
import { DEFAULT_TZ, localDateString, monthOf } from "./time";

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

/** 同じ人のほかの AI の依頼が終わらず、待っても鍵が取れなかった（AI は呼ばない） */
export class AiBusyError extends Error {
  constructor() {
    super("前のAIの依頼を処理しています。終わってから、もう一度お試しください");
  }
}

export type BudgetedResult<T> = { result: T; usage: Usage; costPercent: number };

/**
 * 1人が同時に送れる AI の依頼は1つまで。ほかの依頼（チャット・おすすめ・ひと言）が動いていたら、終わるまで待つ。
 * 待つ間隔と回数（合わせて約15秒）。テストでは短くする
 */
export const LOCK_WAIT = { intervalMs: 200, tries: 75 };
/** 鍵の有効期限（秒）。処理の途中で落ちても、これを過ぎれば次の依頼が通る（API の最長の実行時間60秒より長くする） */
export const LOCK_TTL_SECONDS = 90;
/**
 * 依頼を受けてから、AI の返事を待ってよい時間（ミリ秒）。API の実行時間の上限（maxDuration = 60秒）より短くし、
 * 打ち切られる前に費用の記録と返事を終える
 */
export const AI_TIME_LIMIT_MS = 50_000;

/** 鍵を取り、外す関数を返す。鍵の表が無いなど、鍵を使えないときは記録だけして通す（AI が使えなくならないように） */
async function lockAi(store: Store, userId: string): Promise<() => Promise<void>> {
  const token = crypto.randomUUID();
  for (let i = 0; i < LOCK_WAIT.tries; i++) {
    let ok: boolean;
    try {
      ok = await store.acquireAiLock(userId, token, LOCK_TTL_SECONDS);
    } catch (err) {
      console.error("AI の依頼の鍵を使えませんでした（schema.sql の更新が必要かもしれません）", err);
      return async () => {};
    }
    if (ok) return () => store.releaseAiLock(userId, token).catch((err) => console.error("AI の依頼の鍵を外せませんでした", err));
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT.intervalMs));
  }
  throw new AiBusyError();
}

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
 * 0. 短い時間に送りすぎていないか、全員の AI の費用が1日の上限に達していないかを確かめる（lib/guards.ts）。
 *    その人の AI の依頼の鍵を取る（同時に1つまで。ほかの依頼が終わるまで待つ）
 * 1. 今日の予算から RESERVE_USD を先に押さえる。押さえる前の時点で、今日か今月の予算を
 *    使い切っていたら、押さえた分を戻して BudgetExceededError（AI は呼ばない）
 * 2. fn に meter を渡して実行する（Claude は lib/claude.ts の createMessage(meter, …) で呼ぶ）。
 *    meter には、今日と今月の予算の残りの少ないほうを、この依頼で使える額として持たせる。
 *    createMessage は、1回ごとの最悪の費用がその残りに入るよう返事の長さを抑え、入らなければ AI を呼ばない
 * 3. AI を1回呼ぶたびに費用を記録し、最後に押さえた分を戻す（失敗しても必ず精算する）。最後に鍵を外す。
 *    AI の返事は、依頼を受けてから AI_TIME_LIMIT_MS までに待ち終える（サーバーに打ち切られると、費用を記録できないため）
 */
export async function withAiBudget<T>(
  ctx: { store: Store; userId: string; tz: string; now?: Date; plan: Plan },
  fn: (meter: CostMeter) => Promise<T>,
): Promise<BudgetedResult<T>> {
  const deadline = Date.now() + AI_TIME_LIMIT_MS;
  await rateLimit(ctx.store, ctx.userId, "ai");
  // 全員の合計は、運営の日付（日本時間）で数える
  await checkGlobalLimit(ctx.store, ctx.plan, localDateString(ctx.now ?? new Date(), DEFAULT_TZ));
  const unlock = await lockAi(ctx.store, ctx.userId);
  try {
    return await spendWithinBudget(ctx, deadline, fn);
  } finally {
    await unlock();
  }
}

async function spendWithinBudget<T>(
  ctx: { store: Store; userId: string; tz: string; now?: Date; plan: Plan },
  deadline: number,
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
  const spent = { dayUsd: reserved - RESERVE_USD, monthUsd: monthReserved - RESERVE_USD };
  const before = usageOf(spent, plan);
  if (before.exhausted) {
    await store.addCost(userId, date, -RESERVE_USD).catch(() => {});
    throw new BudgetExceededError(before);
  }
  await store.incrementUsage(userId, date);

  // この依頼で使える額：今日と今月の予算の残りの少ないほう
  const rule = PLANS[plan];
  // AI を1回呼ぶたびに、その費用をすぐ記録する（途中で打ち切られても、使った分が残る）。記録できなかった分は、最後にまとめて記録する
  let unrecorded = 0;
  const persist = async (usd: number) => {
    await store.addCost(userId, date, usd).catch((err) => {
      unrecorded += usd;
      console.error("AI の費用を記録できませんでした。最後にもう一度記録します", err);
    });
  };
  const meter = new CostMeter(Math.max(0, Math.min(rule.dailyUsd - spent.dayUsd, rule.monthlyUsd - spent.monthUsd)), persist, deadline);
  let settled = false;
  // 精算：先に押さえた分を戻す（実際の費用は記録済み）
  const settle = async (): Promise<number> => {
    settled = true;
    return store.addCost(userId, date, unrecorded - RESERVE_USD).catch((err) => {
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
