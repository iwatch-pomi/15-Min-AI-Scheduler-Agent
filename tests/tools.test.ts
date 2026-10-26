import { beforeEach, describe, expect, it } from "vitest";
import { MemoryCalendar } from "@/lib/calendar/memory";
import { RecordingCalendar, undoOps } from "@/lib/ops";
import { ToolError, executeTool } from "@/lib/tools";
import type { Block } from "@/lib/types";

const tz = "Asia/Tokyo";
const now = new Date("2026-10-26T04:00:00Z"); // 13:00 JST
const jst = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00+09:00`).toISOString();

let base: MemoryCalendar;
let cal: RecordingCalendar;

beforeEach(() => {
  const seed: Block[] = [
    { id: "mtg", title: "MTG", start: jst("14:00"), end: jst("15:00"), ai: false },
    { id: "ai-1", title: "資料作成", start: jst("15:00"), end: jst("15:30"), ai: true, energy: "HIGH" },
  ];
  base = new MemoryCalendar(crypto.randomUUID(), seed);
  cal = new RecordingCalendar(base);
});

const run = (name: string, input: unknown) => executeTool(name, input, { calendar: cal, tz, now });

describe("tools", () => {
  it("get_schedule は今以降の空き枠を返す", async () => {
    const res = (await run("get_schedule", { from: "2026-10-26", to: "2026-10-26" })) as {
      days: { events: { id: string }[]; free: { start: string; end: string }[] }[];
    };
    expect(res.days[0].events.map((e) => e.id)).toEqual(["mtg", "ai-1"]);
    expect(res.days[0].free[0]).toMatchObject({ start: "2026-10-26T13:00+09:00", end: "2026-10-26T14:00+09:00" });
  });

  it("create_blocks は15分単位に丸めて作成し、重なりを警告する", async () => {
    const res = (await run("create_blocks", {
      blocks: [
        { title: "要件定義", start: "2026-10-26T13:05+09:00", minutes: 50, energy: "HIGH" },
        { title: "返信", start: "2026-10-26T14:30+09:00", minutes: 15, energy: "LOW" },
      ],
    })) as { created: { start: string; minutes: number }[]; warnings: string[] };
    expect(res.created[0]).toMatchObject({ start: "2026-10-26T13:00+09:00", minutes: 60 });
    expect(res.warnings).toHaveLength(1);
    expect(cal.ops.map((o) => o.kind)).toEqual(["create", "create"]);
  });

  it("Google の既存予定は変更・削除できない", async () => {
    await expect(run("delete_block", { id: "mtg" })).rejects.toThrow(ToolError);
    await expect(run("update_block", { id: "mtg", title: "x" })).rejects.toThrow(ToolError);
  });

  it("shift_following は AI ブロックだけを後ろ倒しする", async () => {
    await run("shift_following", { from: "2026-10-26T13:00+09:00", minutes: 15 });
    expect((await base.get("ai-1"))?.start).toBe(jst("15:15"));
    expect((await base.get("mtg"))?.start).toBe(jst("14:00"));
  });

  it("不正な入力はエラーにする", async () => {
    await expect(run("create_blocks", { blocks: [] })).rejects.toThrow(ToolError);
    await expect(run("shift_following", { from: "2026-10-26T13:00+09:00", minutes: 10 })).rejects.toThrow(ToolError);
  });

  it("undoOps で作成・変更・削除をまとめて元に戻せる", async () => {
    await run("create_blocks", { blocks: [{ title: "新規", start: "2026-10-26T16:00+09:00", minutes: 30, energy: "MEDIUM" }] });
    await run("update_block", { id: "ai-1", start: "2026-10-26T17:00+09:00" });
    await run("delete_block", { id: "ai-1" });

    await undoOps(base, cal.ops);

    const day = await base.list(new Date(jst("00:00")), new Date(jst("23:59")));
    expect(day.map((b) => [b.title, b.start])).toEqual([
      ["MTG", jst("14:00")],
      ["資料作成", jst("15:00")],
    ]);
  });
});
