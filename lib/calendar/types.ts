import type { Routine, RoutineInput } from "../routines";
import type { Block, BlockInput, BlockPatch } from "../types";

/** カレンダーの読み書き。本番は Google、デモ・テストはメモリ実装を使う */
export interface CalendarBackend {
  list(from: Date, to: Date): Promise<Block[]>;
  get(id: string): Promise<Block | null>;
  /** AI ブロックとして作成する */
  create(input: BlockInput): Promise<Block>;
  update(id: string, patch: BlockPatch): Promise<Block>;
  remove(id: string): Promise<void>;
  /** Undo で削除を取り消す。ルーティンの1回分は同じ予定として戻し、それ以外は作り直す（id が変わることがある） */
  restore(block: Block): Promise<Block>;

  listRoutines(): Promise<Routine[]>;
  createRoutine(input: RoutineInput, tz: string): Promise<Routine>;
  /** 今日以降の分を新しい内容にする（過去の分はそのまま残る） */
  updateRoutine(id: string, input: RoutineInput, tz: string): Promise<Routine>;
  /** 今日以降の分をなくす（過去の分はそのまま残る） */
  deleteRoutine(id: string, tz: string): Promise<void>;
}
