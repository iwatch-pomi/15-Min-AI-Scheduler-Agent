import type { Store } from "./store/types";
import { localTime } from "./time";
import type { ChangeItem } from "./ui";

// AI を介さない操作（［元に戻す］・結果カードでの手動編集）を、チャット履歴に「操作の記録」として残す。
// AI は次の依頼でこの記録を読むので、取り消した予定を勝手に入れ直したりしない。
// messages テーブルには user として保存し、先頭の印で見分ける（画面では小さな灰色の行で表示）

export const ACTIVITY_PREFIX = "［操作の記録］";

export function isActivity(content: string): boolean {
  return content.startsWith(ACTIVITY_PREFIX);
}

const KIND = { create: "追加", update: "変更", delete: "削除" } as const;

function describe(items: ChangeItem[], tz: string): string {
  return [...items]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((i) => `${localTime(new Date(i.start), tz)}-${localTime(new Date(i.end), tz)} ${i.title}（${KIND[i.kind]}）`)
    .join("、");
}

export function undoNote(items: ChangeItem[], tz: string): string {
  return `${ACTIVITY_PREFIX}ユーザーが画面の［元に戻す］で、次の変更を取り消しました：${describe(items, tz)}。取り消した予定は、ユーザーがもう一度頼まない限り入れ直さないこと。`;
}

export function editNote(items: ChangeItem[], removed: number, tz: string): string {
  const parts = [];
  if (items.length) parts.push(`次のように直しました：${describe(items, tz)}`);
  if (removed) parts.push(`${removed}件を削除しました`);
  return `${ACTIVITY_PREFIX}ユーザーが結果カードで予定を手で編集し、${parts.join("。")}。この内容を正として扱うこと。`;
}

/** 記録に失敗しても、操作そのものは成功させる */
export async function recordActivity(store: Store, userId: string, content: string): Promise<void> {
  await store.addMessages(userId, [{ role: "user", content }]).catch((err) => console.error("操作の記録を残せませんでした", err));
}
