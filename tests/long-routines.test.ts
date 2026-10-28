import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCalendar } from "@/lib/calendar/memory";
import { durationLabel, endOf, minutesFromTimes, rangeLabel, routineInputSchema } from "@/lib/routines";
import { freeSlots } from "@/lib/slots";
import { suggestions } from "@/lib/suggest";
import { iconFor } from "@/lib/ui";

const tz = "Asia/Tokyo";
const at = (d: string, hh: string) => new Date(`${d}T${hh}:00+09:00`);

describe("長いルーティンの時刻の計算", () => {
  it("終了が開始より前なら翌日として長さを数える", () => {
    expect(minutesFromTimes("23:00", "07:00")).toBe(8 * 60);
    expect(minutesFromTimes("09:00", "16:30")).toBe(7 * 60 + 30);
    expect(minutesFromTimes("07:00", "07:00")).toBe(24 * 60); // 同じ時刻は24時間 → 登録できない
    expect(endOf("23:00", 480)).toEqual({ time: "07:00", nextDay: true });
    expect(rangeLabel({ time: "23:00", minutes: 480 })).toBe("23:00〜翌07:00");
    expect(rangeLabel({ time: "09:00", minutes: 450 })).toBe("09:00〜16:30");
    expect(durationLabel(450)).toBe("7時間30分");
    expect(durationLabel(480)).toBe("8時間");
  });

  it("23時間45分まで登録でき、24時間は登録できない", () => {
    const base = { title: "睡眠", time: "23:00", days: [0, 1, 2, 3, 4, 5, 6] };
    expect(routineInputSchema.safeParse({ ...base, minutes: 8 * 60 }).success).toBe(true);
    expect(routineInputSchema.safeParse({ ...base, minutes: 24 * 60 - 15 }).success).toBe(true);
    expect(routineInputSchema.safeParse({ ...base, minutes: 24 * 60 }).success).toBe(false);
  });

  it("睡眠は月のアイコン", () => {
    expect(iconFor({ title: "睡眠", ai: true })).toBe("sleep");
    expect(iconFor({ title: "寝る", ai: true })).toBe("sleep");
  });
});

describe("日付をまたぐルーティン（睡眠 23:00〜翌7:00）", () => {
  let cal: MemoryCalendar;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at("2026-10-28", "08:00"));
    cal = new MemoryCalendar(crypto.randomUUID());
  });
  afterEach(() => vi.useRealTimers());

  it("前の日の夜からの分も、その日の予定に入り、空き時間から外れる", async () => {
    vi.setSystemTime(at("2026-10-27", "08:00")); // 前の日に登録
    await cal.createRoutine({ title: "睡眠", time: "23:00", minutes: 480, days: [0, 1, 2, 3, 4, 5, 6] }, tz);
    await cal.createRoutine({ title: "授業", time: "09:00", minutes: 450, days: [1, 2, 3, 4, 5] }, tz);
    vi.setSystemTime(at("2026-10-28", "08:00"));

    const day = await cal.list(at("2026-10-28", "00:00"), at("2026-10-29", "00:00"));
    expect(day.map((b) => `${b.title} ${b.start}`)).toEqual([
      "睡眠 2026-10-27T14:00:00.000Z", // 27日 23:00〜28日 7:00
      "授業 2026-10-28T00:00:00.000Z", // 9:00〜16:30
      "睡眠 2026-10-28T14:00:00.000Z", // 28日 23:00〜
    ]);
    const free = freeSlots(day, at("2026-10-28", "00:00"), at("2026-10-29", "00:00"));
    expect(free.map((s) => [s.start.toISOString(), s.end.toISOString()])).toEqual([
      ["2026-10-27T22:00:00.000Z", "2026-10-28T00:00:00.000Z"], // 7:00〜9:00
      ["2026-10-28T07:30:00.000Z", "2026-10-28T14:00:00.000Z"], // 16:30〜23:00
    ]);
  });

  it("起きた直後には休憩のおすすめを出さず、長い授業のあとには出す", async () => {
    vi.setSystemTime(at("2026-10-27", "08:00"));
    await cal.createRoutine({ title: "睡眠", time: "23:00", minutes: 480, days: [0, 1, 2, 3, 4, 5, 6] }, tz);
    await cal.createRoutine({ title: "授業", time: "09:00", minutes: 450, days: [1, 2, 3, 4, 5] }, tz);
    vi.setSystemTime(at("2026-10-28", "06:00"));
    const events = await cal.list(at("2026-10-28", "00:00"), at("2026-10-29", "00:00"));
    const s = suggestions({ date: "2026-10-28", tz, now: at("2026-10-28", "06:00"), today: "2026-10-28", events });
    const brk = s.find((x) => x.id === "break");
    expect(brk?.prompt).toBe("16:30から15分の休憩を入れて");
  });
});
