import { PLANS, type Plan } from "./plans";

// AI の利用上限。回数ではなく、実際にかかった費用（トークン数 × 料金）で決める。
// 上限は「1日」と「1か月」の両方。金額はプランごとに lib/plans.ts で決める

/** どちらの上限に達したか */
export type LimitReason = "day" | "month";

/** 画面に出す使用量。表示は「残り何％」だけ */
export type Usage = {
  /** 今日の残りと今月の残りの、少ないほう */
  remainingPercent: number;
  exhausted: boolean;
  /** 上限に達したときの理由。達していなければ null */
  reason: LimitReason | null;
  monthRemainingPercent: number;
  plan: Plan;
};

/** 使った費用（米ドル）。今月の分には今日の分も入る */
export type Spent = { dayUsd: number; monthUsd: number };

function remainingPercent(used: number, budget: number): number {
  const remaining = Math.max(0, 1 - used / budget);
  // 少しでも残っていれば 1% と出す（0% なのに送れる、を避ける）
  return remaining === 0 ? 0 : Math.max(1, Math.floor(remaining * 100));
}

export function usageOf(spent: Spent, plan: Plan): Usage {
  const rule = PLANS[plan];
  const day = remainingPercent(spent.dayUsd, rule.dailyUsd);
  const month = remainingPercent(spent.monthUsd, rule.monthlyUsd);
  // 今月の上限を先に見る（今日の分を待っても戻らないので）
  const reason: LimitReason | null = spent.monthUsd >= rule.monthlyUsd ? "month" : spent.dayUsd >= rule.dailyUsd ? "day" : null;
  return { remainingPercent: Math.min(day, month), exhausted: reason !== null, reason, monthRemainingPercent: month, plan };
}

/** 1回の依頼で、1日の予算の何％を使ったか（チャットに小さく出す） */
export function percentOfBudget(usd: number, plan: Plan): number {
  return Math.round((usd / PLANS[plan].dailyUsd) * 1000) / 10;
}

/** 画面の最初の表示（まだ読み込んでいないとき） */
export const INITIAL_USAGE: Usage = { remainingPercent: 100, exhausted: false, reason: null, monthRemainingPercent: 100, plan: "free" };
