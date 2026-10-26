import type { ChatMessage, Operation } from "../types";

/** 操作ログ（Undo）・チャット履歴・利用回数の保存先 */
export interface Store {
  recordOps(userId: string, groupId: string, ops: Operation[]): Promise<void>;
  /** まだ取り消していない操作を記録順で返す */
  getOps(userId: string, groupId: string): Promise<Operation[]>;
  markUndone(userId: string, groupId: string): Promise<void>;
  addMessages(userId: string, messages: ChatMessage[], groupId?: string): Promise<void>;
  /** 古い順に、直近 limit 件 */
  recentMessages(userId: string, limit: number): Promise<ChatMessage[]>;
  /** 今日の利用回数を1増やし、増やした後の回数を返す */
  incrementUsage(userId: string, date: string): Promise<number>;
}
