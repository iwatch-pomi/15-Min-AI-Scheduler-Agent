import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCalendar } from "@/lib/calendar/memory";
import { RecordingCalendar, undoOps } from "@/lib/ops";
import { daysLabel, firstDate, parseRrule, routineInputSchema, toRrule, untilBefore } from "@/lib/routines";
import { executeTool } from "@/lib/tools";

const tz = "Asia/Tokyo";

describe("ルーティンの決まりごと", () => {
  it("曜日と RRULE を行き来できる", () => {
    expect(toRrule([5, 1, 3])).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(parseRrule(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"])).toEqual({ days: [1, 3, 5], until: null });
    expect(parseRrule(["RRULE:FREQ=DAILY"])?.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(parseRrule(["RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20261027T145959Z"])?.until?.toISOString()).toBe("2026-10-27T14:59:59.000Z");
    expect(parseRrule(["RRULE:FREQ=MONTHLY;BYMONTHDAY=1"])).toBeNull();
  });

  it("UNTIL はその日の0時（ユーザーの時間）の1秒前", () => {
    expect(untilBefore("2026-10-28", tz)).toBe("20261027T145959Z");
  });

  it("最初の日は、今日以降で曜日が合う日", () => {
    expect(firstDate("2026-10-28", [0, 1, 2, 3, 4, 5, 6])).toBe("2026-10-28"); // 水
    expect(firstDate("2026-10-28", [1])).toBe("2026-11-02"); // 次の月曜
  });

  it("曜日の表示", () => {
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6])).toBe("毎日");
    expect(daysLabel([1, 2, 3, 4, 5])).toBe("平日");
    expect(daysLabel([6, 0])).toBe("土日");
    expect(daysLabel([0, 5, 1, 3])).toBe("月・水・金・日");
  });

  it("入力のチェック：15分刻み、曜日1つ以上", () => {
    const ok = { title: "ジム", time: "19:00", minutes: 60, days: [1, 3, 5] };
    expect(routineInputSchema.safeParse(ok).success).toBe(true);
    expect(routineInputSchema.safeParse({ ...ok, time: "19:10" }).success).toBe(false);
    expect(routineInputSchema.safeParse({ ...ok, minutes: 50 }).success).toBe(false);
    expect(routineInputSchema.safeParse({ ...ok, days: [] }).success).toBe(false);
  });
});

describe("ルーティン（メモリのカレンダー）", () => {
  let cal: MemoryCalendar;
  const day = (d: string, hh = "00:00") => new Date(`${d}T${hh}:00+09:00`);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T08:00:00+09:00")); // 水曜の朝
    cal = new MemoryCalendar(crypto.randomUUID());
  });
  afterEach(() => vi.useRealTimers());

  const titlesBetween = async (from: string, to: string) =>
    (await cal.list(day(from), day(to))).map((b) => `${b.start.slice(5, 10)} ${b.title}${b.routine ? "↻" : ""}`);

  it("決めた曜日ごとにカレンダーに入る", async () => {
    await cal.createRoutine({ title: "ジム", time: "19:00", minutes: 60, days: [1, 3, 5] }, tz);
    expect(await titlesBetween("2026-10-28", "2026-11-03")).toEqual(["10-28 ジム↻", "10-30 ジム↻", "11-02 ジム↻"]);
    expect(await cal.listRoutines()).toEqual([expect.objectContaining({ title: "ジム", time: "19:00", minutes: 60, days: [1, 3, 5] })]);
  });

  it("AI はその日の1回分だけスキップ・移動でき、元に戻すこともできる", async () => {
    await cal.createRoutine({ title: "朝の準備", time: "07:00", minutes: 30, days: [0, 1, 2, 3, 4, 5, 6] }, tz);
    const rec = new RecordingCalendar(cal);
    const now = new Date();
    const [today] = await cal.list(day("2026-10-28"), day("2026-10-29"));
    await executeTool("delete_block", { id: today.id }, { calendar: rec, tz, now });
    const [tomorrow] = await cal.list(day("2026-10-29"), day("2026-10-30"));
    await executeTool("update_block", { id: tomorrow.id, start: "2026-10-29T07:15+09:00" }, { calendar: rec, tz, now });

    expect((await cal.list(day("2026-10-28"), day("2026-10-31"))).map((b) => b.start)).toEqual([
      "2026-10-28T22:15:00.000Z",
      "2026-10-29T22:00:00.000Z",
    ]); // 28日はなし、29日は7:15、30日はいつもどおり7:00

    await undoOps(cal, rec.ops);
    expect((await cal.list(day("2026-10-28"), day("2026-10-30"))).map((b) => b.start)).toEqual([
      "2026-10-27T22:00:00.000Z",
      "2026-10-28T22:00:00.000Z",
    ]);
  });

  it("「15分延長」などのまとめてずらす操作では、ルーティンは動かない", async () => {
    await cal.createRoutine({ title: "ジム", time: "19:00", minutes: 60, days: [3] }, tz);
    const block = await cal.create({ title: "課題", start: day("2026-10-28", "10:00").toISOString(), end: day("2026-10-28", "11:00").toISOString() });
    await executeTool("shift_following", { from: "2026-10-28T09:00+09:00", minutes: 15 }, { calendar: new RecordingCalendar(cal), tz, now: new Date() });
    expect((await cal.get(block.id))?.start).toBe(day("2026-10-28", "10:15").toISOString());
    expect((await cal.list(day("2026-10-28", "18:00"), day("2026-10-29")))[0].start).toBe(day("2026-10-28", "19:00").toISOString());
  });

  it("変更・削除は今日以降に反映され、過去の分は残る", async () => {
    vi.setSystemTime(new Date("2026-10-26T08:00:00+09:00")); // 月曜に登録
    const r = await cal.createRoutine({ title: "日記", time: "22:00", minutes: 15, days: [0, 1, 2, 3, 4, 5, 6] }, tz);
    vi.setSystemTime(new Date("2026-10-28T08:00:00+09:00")); // 水曜に変更
    await cal.updateRoutine(r.id, { title: "日記", time: "21:30", minutes: 15, days: [0, 1, 2, 3, 4, 5, 6] }, tz);
    const times = (await cal.list(day("2026-10-26"), day("2026-10-30"))).map((b) => `${b.start.slice(5, 10)} ${b.start.slice(11, 16)}`);
    expect(times).toEqual(["10-26 13:00", "10-27 13:00", "10-28 12:30", "10-29 12:30"]); // UTC。22:00 → 21:30（JST）

    const [current] = await cal.listRoutines();
    await cal.deleteRoutine(current.id, tz);
    expect(await cal.listRoutines()).toEqual([]);
    expect(await titlesBetween("2026-10-26", "2026-10-31")).toEqual(["10-26 日記↻", "10-27 日記↻"]);
  });
});
