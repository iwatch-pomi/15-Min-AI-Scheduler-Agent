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
    ? { bg: "bg-blk-blue-bg", line: "border-l-blk-blue", dot: "text-blk-blue" }
    : { bg: "bg-blk-gray-bg", line: "border-l-blk-gray", dot: "text-blk-gray" };
}
