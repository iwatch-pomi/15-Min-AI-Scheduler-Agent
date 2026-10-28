import { ACTIVITY_PREFIX, isActivity } from "./activity";
import type { ChatMessage } from "./types";

// AI に渡す会話の履歴を短くして、費用を下げる。
// 直近 KEEP_RECENT 件はそのまま、それより前（HISTORY_LIMIT 件まで）は短い要約1つにまとめる。
// 要約は AI を使わずにアプリで作る（要約のために AI を呼ぶと、その分の費用と待ち時間が増えるため）

export const HISTORY_LIMIT = 10;
export const KEEP_RECENT = 5;
export const SUMMARY_PREFIX = "［これより前の会話の要約］";

const USER_MAX = 40;
const ASSISTANT_MAX = 60;
// ［元に戻す］などの操作の記録は、AI が予定を入れ直さないための大事な情報なので長めに残す
const ACTIVITY_MAX = 160;

/** 古い順の履歴を、要約1つ＋直近 keep 件にする */
export function compactHistory(messages: ChatMessage[], keep = KEEP_RECENT): ChatMessage[] {
  if (messages.length <= keep) return messages;
  const older = messages.slice(0, messages.length - keep);
  const recent = messages.slice(-keep);
  const lines = older.map((m) => {
    if (m.role === "user" && isActivity(m.content)) return `- ${ACTIVITY_PREFIX}${cut(m.content.slice(ACTIVITY_PREFIX.length), ACTIVITY_MAX)}`;
    if (m.role === "user") return `- ユーザー：${cut(m.content, USER_MAX)}`;
    return `- AI：${cut(m.content, ASSISTANT_MAX)}`;
  });
  return [{ role: "user", content: `${SUMMARY_PREFIX}\n${lines.join("\n")}` }, ...recent];
}

/** 改行をまとめ、長すぎる文は … で切る */
function cut(text: string, max: number): string {
  const s = text.replace(/\s*\n\s*/g, " / ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
