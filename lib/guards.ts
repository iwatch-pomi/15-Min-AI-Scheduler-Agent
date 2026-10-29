import type { Plan } from "./plans";
import type { Store } from "./store/types";

// 悪用・異常な費用を止めるための決まり（AI の予算とは別）。
// 1. 1人が短い時間に送れる回数（AI を使わない操作も、データベースやカレンダーに書き込むので）
// 2. 全員の AI の費用の、1日の上限（プログラムの不具合や、たくさんのアカウントを使った悪用に備える最後の安全装置）

/** 回数の決まり（windowSeconds 秒あたり max 回まで） */
export const RATE_LIMITS = {
  /** チャットの送信（AI を使わずアプリで処理するものも含む） */
  chat: { max: 20, windowSeconds: 60 },
  /** AI を使う依頼（チャット・おすすめ・ひと言） */
  ai: { max: 20, windowSeconds: 60 },
  /** AI を使わない書き込み（手での編集・元に戻す・ルーティン・設定・履歴の削除） */
  write: { max: 60, windowSeconds: 60 },
  /** お支払い（Stripe に問い合わせる。Stripe の回数の制限は全員で共有なので、1人に使い切らせない） */
  billing: { max: 20, windowSeconds: 60 },
} as const;
export type RateKind = keyof typeof RATE_LIMITS;

export class RateLimitError extends Error {
  constructor() {
    super("操作が多すぎます。少し待ってから、もう一度お試しください");
  }
}

/**
 * 回数を数え、多すぎれば RateLimitError。
 * 数える表が無い（schema.sql の更新前）など、数えられないときは記録だけして通す（アプリが使えなくならないように）
 */
export async function rateLimit(store: Store, userId: string, kind: RateKind): Promise<void> {
  const { max, windowSeconds } = RATE_LIMITS[kind];
  let count: number;
  try {
    count = await store.hitRateLimit(userId, kind, windowSeconds);
  } catch (err) {
    console.error("回数の制限を確かめられませんでした（schema.sql の更新が必要かもしれません）", err);
    return;
  }
  if (count > max) throw new RateLimitError();
}

/** 全員の AI の費用が、1日の上限に達して止めている */
export class AiPausedError extends Error {
  constructor() {
    super("AIの利用が一時的に止まっています。時間をおいて、もう一度お試しください");
  }
}

/**
 * 全員の AI の費用の、1日の上限（米ドル）。環境変数で変えられ、"off" で上限なし。
 * - all：全員の合計。超えたら、すべてのプランで AI を止める
 * - free：無料プランの人の合計。超えたら、無料プランだけ AI を止める
 */
export function globalLimits(env: Record<string, string | undefined> = process.env): { all: number; free: number } {
  const read = (v: string | undefined, fallback: number) => {
    if (v?.trim().toLowerCase() === "off") return Infinity;
    const n = Number(v);
    return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return { all: read(env.AI_DAILY_LIMIT_USD, 50), free: read(env.AI_FREE_DAILY_LIMIT_USD, 5) };
}

/** 全員の AI の費用が上限に達していれば AiPausedError。読めないときは記録だけして通す */
export async function checkGlobalLimit(store: Store, plan: Plan, date: string): Promise<void> {
  const limits = globalLimits();
  if (limits.all === Infinity && limits.free === Infinity) return;
  let total: { all: number; free: number };
  try {
    total = await store.getTotalCost(date);
  } catch (err) {
    console.error("全員の AI の費用を読めませんでした（schema.sql の更新が必要かもしれません）", err);
    return;
  }
  if (total.all >= limits.all || (plan === "free" && total.free >= limits.free)) {
    // 運営者が気づけるように、ログに残す（Vercel の Logs）
    console.error(`全員の AI の費用が1日の上限に達したため、AI を止めています（${date}：全員 $${total.all.toFixed(2)}／無料 $${total.free.toFixed(2)}）`);
    throw new AiPausedError();
  }
}
