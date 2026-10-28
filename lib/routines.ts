import { z } from "zod";
import { SLOT_MINUTES, addDays, zonedToUtc } from "./time";

// 毎日のルーティン（例：毎朝7:00 朝の準備 30分、月水金 19:00 ジム 60分）。
// Google では AI 専用カレンダーの「繰り返しの予定」として保存する

/** days は曜日（0=日, 1=月, … 6=土） */
export type Routine = { id: string; title: string; time: string; minutes: number; days: number[] };
export type RoutineInput = Omit<Routine, "id">;

export const routineInputSchema = z.object({
  title: z.string().trim().min(1, "名前を入力してください").max(100),
  time: z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, "時刻は15分刻みで選んでください"),
  minutes: z.number().int().min(SLOT_MINUTES).max(8 * 60).multipleOf(SLOT_MINUTES),
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1, "曜日を1つ以上選んでください")
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
});

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function toRrule(days: number[]): string {
  return `RRULE:FREQ=WEEKLY;BYDAY=${[...days].sort((a, b) => a - b).map((d) => BYDAY[d]).join(",")}`;
}

/** Google の recurrence から曜日と終了日時を読む。読めない形（毎月など）は null */
export function parseRrule(recurrence: string[] | null | undefined): { days: number[]; until: Date | null } | null {
  const rule = recurrence?.find((r) => r.startsWith("RRULE:"));
  if (!rule) return null;
  const parts = Object.fromEntries(
    rule
      .slice(6)
      .split(";")
      .map((p) => p.split("=") as [string, string]),
  );
  let days: number[];
  if (parts.FREQ === "DAILY" && !parts.BYDAY) days = [0, 1, 2, 3, 4, 5, 6];
  else if (parts.FREQ === "WEEKLY" && parts.BYDAY) days = parts.BYDAY.split(",").map((d: string) => BYDAY.indexOf(d.slice(-2)));
  else return null;
  if (days.some((d) => d < 0)) return null;
  return { days: days.sort((a, b) => a - b), until: parts.UNTIL ? parseUntil(parts.UNTIL) : null };
}

function parseUntil(v: string): Date {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 23), +(m[5] ?? 59), +(m[6] ?? 59)));
}

/** その日付が「その日の0時より前まで」で終わる UNTIL（RRULE の形式、UTC） */
export function untilBefore(date: string, tz: string): string {
  const end = new Date(zonedToUtc(date, 0, 0, tz).getTime() - 1000);
  return end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** date 以降で、最初に days の曜日に当たる日 */
export function firstDate(date: string, days: number[]): string {
  for (let i = 0; i < 7; i++) {
    const d = addDays(date, i);
    if (days.includes(weekdayOf(d))) return d;
  }
  return date;
}

const LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** 曜日の表示（毎日・平日・土日・月水金…） */
export function daysLabel(days: number[]): string {
  const key = [...days].sort((a, b) => a - b).join("");
  if (key === "0123456") return "毎日";
  if (key === "12345") return "平日";
  if (key === "06") return "土日";
  return [...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => LABELS[d])
    .join("・");
}
