// AI 画面の入力欄の上に出すワンタップのボタン（クイックボタン）。ユーザーが自由に決められ、端末間で共有する

export const DEFAULT_QUICK_ACTIONS = ["15分延長", "割り込み30分", "今のをスキップ", "今日の残りを組み直して"];
export const MAX_QUICK_ACTIONS = 8;
export const MAX_QUICK_ACTION_LENGTH = 30;

/** 前後の空白を取り、空・重複を除き、長すぎるものは使わず、最大数までにそろえる */
export function normalizeQuickActions(list: unknown[]): string[] {
  const out: string[] = [];
  for (const v of list) {
    if (typeof v !== "string") continue;
    const s = v.replace(/\s+/g, " ").trim();
    if (!s || s.length > MAX_QUICK_ACTION_LENGTH || out.includes(s)) continue;
    out.push(s);
    if (out.length >= MAX_QUICK_ACTIONS) break;
  }
  return out;
}
