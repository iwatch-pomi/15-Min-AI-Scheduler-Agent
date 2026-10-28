import { beforeEach, describe, expect, it } from "vitest";
import { MemoryCalendar } from "@/lib/calendar/memory";
import { ManualEditError, applyManualChanges, manualChangesSchema } from "@/lib/manual";
import { RecordingCalendar, undoOps } from "@/lib/ops";
import { executeTool } from "@/lib/tools";
import type { Block, Operation } from "@/lib/types";

const tz = "Asia/Tokyo";
const now = new Date("2026-10-28T06:00:00Z"); // 15:00 JST
const jst = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00+09:00`).toISOString();

let base: MemoryCalendar;

beforeEach(() => {
  const seed: Block[] = [{ id: "mtg", title: "MTG", start: jst("18:00"), end: jst("19:00"), ai: false }];
  base = new MemoryCalendar(crypto.randomUUID(), seed);
});

/** AI が3つの予定を入れた状態を作り、その操作ログと作成された id を返す */
async function aiCreates() {
  const ai = new RecordingCalendar(base);
  await executeTool(
    "create_blocks",
    {
      blocks: [
        { title: "確認", start: "2026-10-28T15:30+09:00", minutes: 15, energy: "LOW" },
        { title: "作成", start: "2026-10-28T15:45+09:00", minutes: 60, energy: "HIGH" },
        { title: "提出", start: "2026-10-28T16:45+09:00", minutes: 15, energy: "LOW" },
      ],
    },
    { calendar: ai, tz, now },
  );
  return { ops: ai.ops, ids: ai.ops.map((o) => o.blockId) };
}

const titlesOnDay = async () =>
  (await base.list(new Date(jst("00:00")), new Date(jst("23:59")))).map((b) => [b.title, b.start, b.end]);

describe("applyManualChanges", () => {
  it("タイトル・時刻・長さの変更、項目の追加と削除を反映する", async () => {
    const { ids } = await aiCreates();
    const edit = new RecordingCalendar(base);
    const items = await applyManualChanges(edit, [
      { op: "update", id: ids[1], title: "レポート作成", start: jst("16:00"), minutes: 90 },
      { op: "delete", id: ids[2] },
      { op: "create", title: "復習", start: jst("17:30"), minutes: 30 },
    ]);

    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ["update", "レポート作成"],
      ["create", "復習"],
    ]);
    expect(await titlesOnDay()).toEqual([
      ["確認", jst("15:30"), jst("15:45")],
      ["レポート作成", jst("16:00"), jst("17:30")],
      ["復習", jst("17:30"), jst("18:00")],
      ["MTG", jst("18:00"), jst("19:00")],
    ]);
  });

  it("開始時刻と長さは15分単位にそろえる", async () => {
    const edit = new RecordingCalendar(base);
    const [item] = await applyManualChanges(edit, [{ op: "create", title: "x", start: jst("16:07"), minutes: 20 }]);
    expect([item.start, item.end]).toEqual([jst("16:00"), jst("16:30")]);
  });

  it("Google の既存予定は手動編集でも変更できない", async () => {
    const edit = new RecordingCalendar(base);
    await expect(applyManualChanges(edit, [{ op: "delete", id: "mtg" }])).rejects.toBeInstanceOf(ManualEditError);
    await expect(applyManualChanges(edit, [{ op: "update", id: "mtg", title: "x", start: jst("18:00"), minutes: 60 }])).rejects.toBeInstanceOf(
      ManualEditError,
    );
  });

  it("AI の変更と手動編集をまとめて元に戻すと、AI が入れる前の状態に戻る（手動で消した項目も残らない）", async () => {
    const before = await titlesOnDay();
    const { ops: aiOps, ids } = await aiCreates();
    const edit = new RecordingCalendar(base);
    await applyManualChanges(edit, [
      { op: "delete", id: ids[0] },
      { op: "update", id: ids[1], title: "変更後", start: jst("16:15"), minutes: 30 },
      { op: "create", title: "追加", start: jst("17:30"), minutes: 15 },
    ]);

    const all: Operation[] = [...aiOps, ...edit.ops];
    await undoOps(base, all);
    expect(await titlesOnDay()).toEqual(before);
  });
});

describe("manualChangesSchema", () => {
  it("空のタイトルや15分未満の長さは受け付けない", () => {
    const ok = { op: "create", title: "a", start: "2026-10-28T07:00:00.000Z", minutes: 15 };
    expect(manualChangesSchema.safeParse({ changes: [ok] }).success).toBe(true);
    expect(manualChangesSchema.safeParse({ changes: [{ ...ok, title: "  " }] }).success).toBe(false);
    expect(manualChangesSchema.safeParse({ changes: [{ ...ok, minutes: 10 }] }).success).toBe(false);
    expect(manualChangesSchema.safeParse({ changes: [] }).success).toBe(false);
  });
});
