import type { OpGroup, StoredMessage } from "./store/types";
import type { Operation } from "./types";
import type { ChangeItem, ChatEntry } from "./ui";

/**
 * 操作ログから、結果カードに出す予定の一覧を作る（画面でのライブ表示と同じ決まり）。
 * - AI が追加した予定は、そのあと手で直しても「追加」のまま。手で消したら一覧から外す
 * - 既存の AI の予定を変更・削除したものは「変更」「削除」
 */
export function itemsFromOps(ops: Operation[]): ChangeItem[] {
  const items = new Map<string, ChangeItem>();
  for (const op of ops) {
    const prev = items.get(op.blockId);
    if (op.kind === "delete") {
      if (prev?.kind === "create") items.delete(op.blockId);
      else if (op.before) items.set(op.blockId, toItem(op.before, "delete"));
      continue;
    }
    if (!op.after) continue;
    items.set(op.blockId, toItem(op.after, op.kind === "create" ? "create" : (prev?.kind ?? "update")));
  }
  return [...items.values()];
}

function toItem(b: NonNullable<Operation["before"]>, kind: ChangeItem["kind"]): ChangeItem {
  return { id: b.id, kind, title: b.title, start: b.start, end: b.end, energy: b.energy };
}

/** 保存されたメッセージを、画面のチャット表示の形にする */
export function toChatEntries(messages: StoredMessage[], groups: Map<string, OpGroup>): ChatEntry[] {
  return messages.map((m): ChatEntry => {
    if (m.role === "user") return { id: m.id, role: "user", text: m.content, at: m.createdAt };
    const group = m.opGroupId ? groups.get(m.opGroupId) : undefined;
    const items = group ? itemsFromOps(group.ops) : [];
    return {
      id: m.id,
      role: "assistant",
      text: m.content,
      at: m.createdAt,
      result: group && m.opGroupId && items.length ? { opIds: [m.opGroupId], items, undone: group.undone } : undefined,
    };
  });
}
