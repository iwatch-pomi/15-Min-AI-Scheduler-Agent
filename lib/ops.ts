import type { CalendarBackend } from "./calendar/types";
import type { Block, BlockInput, BlockPatch, Operation } from "./types";

/**
 * カレンダーへの書き込みを記録しながら行うラッパー。
 * 1回のチャットで行った操作を ops に溜め、あとで Store に保存して Undo に使う。
 */
export class RecordingCalendar {
  readonly ops: Operation[] = [];

  constructor(private inner: CalendarBackend) {}

  list(from: Date, to: Date) {
    return this.inner.list(from, to);
  }

  get(id: string) {
    return this.inner.get(id);
  }

  async create(input: BlockInput): Promise<Block> {
    const after = await this.inner.create(input);
    this.ops.push({ kind: "create", blockId: after.id, before: null, after });
    return after;
  }

  async update(before: Block, patch: BlockPatch): Promise<Block> {
    const after = await this.inner.update(before.id, patch);
    this.ops.push({ kind: "update", blockId: before.id, before, after });
    return after;
  }

  async remove(before: Block): Promise<void> {
    await this.inner.remove(before.id);
    this.ops.push({ kind: "delete", blockId: before.id, before, after: null });
  }
}

/**
 * 操作グループを逆順に戻す。削除の取り消しは作り直しになり id が変わるので、
 * 同じグループ内でその後の操作が古い id を指していても追えるように付け替える。
 */
export async function undoOps(calendar: CalendarBackend, ops: Operation[]): Promise<number> {
  const idMap = new Map<string, string>();
  const resolve = (id: string) => idMap.get(id) ?? id;
  let undone = 0;

  for (const op of [...ops].reverse()) {
    if (op.kind === "create") {
      await calendar.remove(resolve(op.blockId)).catch(ignoreNotFound);
    } else if (op.kind === "update" && op.before) {
      const { title, start, end, energy } = op.before;
      await calendar.update(resolve(op.blockId), { title, start, end, energy });
    } else if (op.kind === "delete" && op.before) {
      const restored = await calendar.restore(op.before);
      if (restored.id !== op.blockId) idMap.set(op.blockId, restored.id);
    }
    undone++;
  }
  return undone;
}

function ignoreNotFound(err: unknown) {
  const code = (err as { code?: number }).code;
  if (code === 404 || code === 410) return;
  throw err;
}
