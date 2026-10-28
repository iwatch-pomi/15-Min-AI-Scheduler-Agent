// 画面で共有する小さな表示用ヘルパー
import type { Block, Energy } from "./types";

export type Tab = "home" | "calendar" | "ai" | "settings";

export type ChangeItem = {
  id: string;
  kind: "create" | "update" | "delete";
  title: string;
  start: string;
  end: string;
  energy?: Energy;
};

export type ChatEntry =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      /** opIds は AI の変更と、そのあとの手動編集の操作グループ（古い順）。元に戻すときは全部を逆順に取り消す */
      result?: { opIds: string[]; items: ChangeItem[]; undone?: boolean };
      error?: boolean;
    };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 2026-10-26 → 10月26日(月) */
export function formatDateJa(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  const w = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  return `${m}月${d}日(${w})`;
}

/** 予定ブロックの色（パステル背景 + 左線）。AI の予定は青、メインのカレンダーの予定はグレー */
export function blockTone(b: Pick<Block, "ai">): { bg: string; line: string; dot: string } {
  return b.ai
    ? { bg: "bg-blk-ai-bg", line: "border-l-blk-ai", dot: "text-blk-ai" }
    : { bg: "bg-blk-main-bg", line: "border-l-blk-main", dot: "text-blk-main" };
}

export type IconKind = "meal" | "coffee" | "study" | "meeting" | "lab" | "work" | "gym" | "ai" | "event";

// タイトルの言葉から、予定カードのアイコンを選ぶ（上から順に判定）
const ICON_RULES: [IconKind, RegExp][] = [
  ["coffee", /朝食|朝の準備|カフェ|コーヒー|休憩/],
  ["meal", /昼食|夕食|ランチ|ディナー|ご飯|ごはん|食事|昼ご飯|晩ご飯/],
  ["gym", /ジム|運動|筋トレ|ランニング|ラン(?![チ])|ヨガ|散歩|ストレッチ/],
  ["lab", /実験|培養|測定|解析/],
  ["meeting", /ミーティング|MTG|会議|打ち合わせ|面談|1on1|ゼミ|相談/i],
  ["study", /授業|講義|勉強|課題|予習|復習|試験|テスト|レポート課題|読書/],
  ["work", /レポート|資料|作成|メール|返信|整理|データ|執筆|コーディング|開発|作業/],
];

export function iconFor(b: Pick<Block, "title" | "ai">): IconKind {
  const hit = ICON_RULES.find(([, re]) => re.test(b.title));
  if (hit) return hit[0];
  return b.ai ? "ai" : "event";
}

/** 時間帯で変わる、ホームのひと言 */
export function greeting(hour: number): { text: string; icon: "sun" | "moon" } {
  if (hour < 5) return { text: "夜ふかしはほどほどに。", icon: "moon" };
  if (hour < 11) return { text: "今日も、いい一日になりますように", icon: "sun" };
  if (hour < 17) return { text: "午後も、マイペースにいきましょう", icon: "sun" };
  return { text: "今日もおつかれさまでした", icon: "moon" };
}
