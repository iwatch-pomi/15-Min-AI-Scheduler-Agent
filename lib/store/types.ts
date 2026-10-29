import type { Suggestion } from "../suggest";
import type { Theme } from "../theme";
import type { ChatMessage, Operation } from "../types";

/** 保存されたチャットの1件（画面の履歴表示用） */
export type StoredMessage = { id: string; role: "user" | "assistant"; content: string; opGroupId: string | null; createdAt: string };

/** 操作グループ（AI の変更と、そのあとの手動編集）。undone は全部取り消し済みか */
export type OpGroup = { ops: Operation[]; undone: boolean };

/** AI で作った「AIのおすすめ／AIブリーフ」。日付とデザイン（口調）ごとに1つ、更新したら新しいものに置き換える */
export type SavedBrief = { date: string; tone: Theme; items: Suggestion[]; costPercent: number; createdAt: string };

/** 操作ログ（Undo）・チャット履歴・利用回数の保存先 */
export interface Store {
  /** 操作を記録する。同じ groupId に続けて記録すると、そのグループの後ろに追加する */
  recordOps(userId: string, groupId: string, ops: Operation[]): Promise<void>;
  /** まだ取り消していない操作を記録順で返す */
  getOps(userId: string, groupId: string): Promise<Operation[]>;
  markUndone(userId: string, groupId: string): Promise<void>;
  addMessages(userId: string, messages: ChatMessage[], groupId?: string): Promise<void>;
  /** 古い順に、直近 limit 件 */
  recentMessages(userId: string, limit: number): Promise<ChatMessage[]>;
  /** 今日の AI 呼び出し回数を1増やす（記録用。上限には使わない） */
  incrementUsage(userId: string, date: string): Promise<number>;
  /** その日に「AIで更新」（AIブリーフ）を使った回数を delta だけ足し、足した後の回数を返す（1回の足し算で数える） */
  addBriefCount(userId: string, date: string, delta: number): Promise<number>;
  getBriefCount(userId: string, date: string): Promise<number>;
  /** 今日の AI の費用（米ドル）を足し、足した後の合計を返す */
  addCost(userId: string, date: string, usd: number): Promise<number>;
  /** チャット履歴を古い順に。before（その id より前）から limit 件 */
  listMessages(userId: string, opts: { before?: string; limit: number }): Promise<{ messages: StoredMessage[]; hasMore: boolean }>;
  /** 履歴の結果カードを作るための操作グループ（取り消し済みも含む） */
  getOpGroups(userId: string, groupIds: string[]): Promise<Map<string, OpGroup>>;
  deleteMessages(userId: string): Promise<void>;
  /** 今日の AI の費用の合計（米ドル） */
  getCost(userId: string, date: string): Promise<number>;
  /** その月（YYYY-MM）の AI の費用の合計（米ドル） */
  getMonthCost(userId: string, month: string): Promise<number>;
  /** AI のおすすめを保存する（同じ日付・口調のものは置き換える）。keepFrom より前の日付のものは消す */
  saveBrief(userId: string, brief: SavedBrief, keepFrom: string): Promise<void>;
  getBrief(userId: string, date: string, tone: Theme): Promise<SavedBrief | null>;
  /** クイックボタン（端末間で共有）。null はまだ決めていない（初期値を使う） */
  getQuickActions(userId: string): Promise<string[] | null>;
  saveQuickActions(userId: string, actions: string[]): Promise<void>;
  /** AI へのカスタム指示（端末間で共有）。null は指示なし */
  getCustomInstructions(userId: string): Promise<string | null>;
  saveCustomInstructions(userId: string, text: string | null): Promise<void>;
}
