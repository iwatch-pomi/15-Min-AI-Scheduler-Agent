export type Energy = "HIGH" | "MEDIUM" | "LOW";

/** タイムラインに並ぶ1つの予定。start/end は UTC の ISO 文字列。 */
export type Block = {
  id: string;
  title: string;
  start: string;
  end: string;
  /** このアプリ（AI）が作ったブロックか。AIが動かせるのは true のものだけ */
  ai: boolean;
  energy?: Energy;
  allDay?: boolean;
  /** 場所（Google の予定に入っていれば） */
  location?: string;
  /** 毎日のルーティンの1回分（AI はユーザーに頼まれたときだけ、その日の分を動かす） */
  routine?: boolean;
};

export type BlockInput = {
  title: string;
  start: string;
  end: string;
  energy?: Energy;
};

export type BlockPatch = Partial<BlockInput>;

/** Undo 用の操作ログ1件。before/after はその時点のブロック */
export type Operation = {
  kind: "create" | "update" | "delete";
  blockId: string;
  before: Block | null;
  after: Block | null;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };
