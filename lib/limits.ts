// AI の1日の利用上限。回数ではなく、実際にかかった費用（トークン数 × 料金）で決める

/** 1ユーザー1日あたりの AI の予算（米ドル）。Vercel の環境変数 DAILY_AI_BUDGET_USD で変えられる */
export function dailyBudgetUsd(): number {
  const n = Number(process.env.DAILY_AI_BUDGET_USD);
  return Number.isFinite(n) && n > 0 ? n : 0.5;
}

/** 画面に出す使用量。表示は「残り何％」だけ */
export type Usage = { remainingPercent: number; exhausted: boolean };

export function usageOf(usedUsd: number): Usage {
  const budget = dailyBudgetUsd();
  const remaining = Math.max(0, 1 - usedUsd / budget);
  // 少しでも残っていれば 1% と出す（0% なのに送れる、を避ける）
  const remainingPercent = remaining === 0 ? 0 : Math.max(1, Math.floor(remaining * 100));
  return { remainingPercent, exhausted: usedUsd >= budget };
}

/** 1回の依頼で予算の何％を使ったか（チャットに小さく出す） */
export function percentOfBudget(usd: number): number {
  return Math.round((usd / dailyBudgetUsd()) * 1000) / 10;
}
