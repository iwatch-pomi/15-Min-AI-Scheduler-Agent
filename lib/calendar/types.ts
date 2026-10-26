import type { Block, BlockInput, BlockPatch } from "../types";

/** カレンダーの読み書き。本番は Google、デモ・テストはメモリ実装を使う */
export interface CalendarBackend {
  list(from: Date, to: Date): Promise<Block[]>;
  get(id: string): Promise<Block | null>;
  /** AI ブロックとして作成する */
  create(input: BlockInput): Promise<Block>;
  update(id: string, patch: BlockPatch): Promise<Block>;
  remove(id: string): Promise<void>;
}
