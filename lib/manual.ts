import { z } from "zod";
import type { RecordingCalendar } from "./ops";
import { SLOT_MINUTES, addMinutes, snapToSlot } from "./time";
import type { Block } from "./types";
import type { ChangeItem } from "./ui";

// AI が提案した予定を、結果カードからユーザーが手で直すときの処理

const title = z.string().trim().min(1, "タイトルを入力してください").max(100);
const start = z.iso.datetime({ offset: true });
const minutes = z.number().int().min(SLOT_MINUTES).max(8 * 60);

export const manualChangesSchema = z.object({
  /** 結果カードのもとになったチャットの操作グループ。指定するとそのグループに続けて記録する */
  opId: z.uuid().optional(),
  tz: z.string().optional(),
  changes: z
    .array(
      z.discriminatedUnion("op", [
        z.object({ op: z.literal("create"), title, start, minutes }),
        z.object({ op: z.literal("update"), id: z.string().min(1), title, start, minutes }),
        z.object({ op: z.literal("delete"), id: z.string().min(1) }),
      ]),
    )
    .min(1)
    .max(30),
});

export type ManualChange = z.infer<typeof manualChangesSchema>["changes"][number];

export class ManualEditError extends Error {}

/**
 * 変更を順に反映する。動かせるのは AI ブロックだけ。
 * 返り値は作成・変更した予定（送られた順）。削除は含めない。
 */
export async function applyManualChanges(calendar: RecordingCalendar, changes: ManualChange[]): Promise<ChangeItem[]> {
  const results: ChangeItem[] = [];
  for (const c of changes) {
    if (c.op === "create") {
      const { startAt, endAt } = span(c.start, c.minutes);
      const block = await calendar.create({ title: c.title, start: startAt, end: endAt, energy: "MEDIUM" });
      results.push(toItem(block, "create"));
      continue;
    }
    const block = await calendar.get(c.id);
    if (!block) throw new ManualEditError("予定が見つかりませんでした。カレンダーで消されたかもしれません");
    if (!block.ai) throw new ManualEditError(`「${block.title}」は Google の既存予定なので変更できません`);
    if (c.op === "delete") {
      await calendar.remove(block);
    } else {
      const { startAt, endAt } = span(c.start, c.minutes);
      const updated = await calendar.update(block, { title: c.title, start: startAt, end: endAt });
      results.push(toItem(updated, "update"));
    }
  }
  return results;
}

function span(startIso: string, mins: number) {
  const s = snapToSlot(new Date(startIso));
  const rounded = Math.ceil(mins / SLOT_MINUTES) * SLOT_MINUTES;
  return { startAt: s.toISOString(), endAt: addMinutes(s, rounded).toISOString() };
}

function toItem(b: Block, kind: ChangeItem["kind"]): ChangeItem {
  return { id: b.id, kind, title: b.title, start: b.start, end: b.end, energy: b.energy };
}
