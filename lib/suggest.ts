import { freeSlots } from "./slots";
import type { Block } from "./types";
import { addDays, addMinutes, localTime, minutesBetween, zonedToUtc } from "./time";

// ホームの「AIのおすすめ」。予定から決まりごとで作る（AI は呼ばない）。
// タップすると AI の入力欄に prompt が入り、送るかどうかはユーザーが決める

export type Suggestion = { id: string; icon: "calendar" | "bulb" | "leaf"; text: string; prompt: string };

const DAY_START = 8;
const DAY_END = 22;
const LONG_RUN_MIN = 150;
const MAX = 3;

export function suggestions(opts: {
  date: string;
  tz: string;
  now: Date;
  today: string;
  events: Block[];
  /** 明日の予定（読み込めていれば） */
  tomorrow?: Block[];
}): Suggestion[] {
  const { date, tz, now, today, events, tomorrow } = opts;
  if (date < today) return [];
  const timed = events.filter((e) => !e.allDay);
  const out: Suggestion[] = [];
  const t = (d: Date) => localTime(d, tz);
  const isToday = date === today;

  // 長く続く予定のあとの休憩
  const runEnd = longRunEnd(timed, LONG_RUN_MIN);
  if (runEnd && (!isToday || runEnd > now) && isFree(timed, runEnd, 15)) {
    out.push({
      id: "break",
      icon: "leaf",
      text: `${t(runEnd)}まで予定が続きます。そのあと15分、ひと息つきませんか？`,
      prompt: `${t(runEnd)}から15分の休憩を入れて`,
    });
  }

  // まとまった空き時間
  let from = zonedToUtc(date, DAY_START, 0, tz);
  if (isToday && now > from) from = ceil15(now);
  const to = zonedToUtc(date, DAY_END, 0, tz);
  const slot = from < to ? freeSlots(timed, from, to, 60)[0] : undefined;
  if (slot) {
    const m = minutesBetween(slot.start, slot.end);
    out.push({
      id: "free",
      icon: "calendar",
      text: `${t(slot.start)}〜${t(slot.end)}が空いています（${m}分）。やることを入れますか？`,
      prompt: `${isToday ? "今日" : dayLabel(date)}の${t(slot.start)}から${Math.min(m, 120)}分で、`,
    });
  }

  // AI の予定がまだない日
  if (!timed.some((e) => e.ai)) {
    out.push({
      id: "plan",
      icon: "bulb",
      text: `やりたいことを送ると、${isToday ? "今日の" : ""}空き時間に15分単位で組み立てます。`,
      prompt: `${isToday ? "今日" : dayLabel(date)}やりたいこと：`,
    });
  }

  // 夜になったら明日の準備
  if (isToday && Number(t(now).slice(0, 2)) >= 18 && tomorrow && !tomorrow.some((e) => e.ai)) {
    out.push({
      id: "tomorrow",
      icon: "bulb",
      text: "明日の予定を、今のうちに組み立てておきましょう。",
      prompt: `明日（${dayLabel(addDays(date, 1))}）やりたいこと：`,
    });
  }

  return out.slice(0, MAX);
}

/** 隙間なく（15分未満の間隔で）続く予定のうち、minMinutes 以上続く最初のかたまりの終わり */
function longRunEnd(timed: Block[], minMinutes: number): Date | null {
  const sorted = [...timed].sort((a, b) => a.start.localeCompare(b.start));
  let runStart: Date | null = null;
  let runEnd: Date | null = null;
  for (const b of sorted) {
    const s = new Date(b.start);
    const e = new Date(b.end);
    if (runEnd && minutesBetween(runEnd, s) < 15) {
      if (e > runEnd) runEnd = e;
    } else {
      if (runStart && runEnd && minutesBetween(runStart, runEnd) >= minMinutes) return runEnd;
      runStart = s;
      runEnd = e;
    }
  }
  return runStart && runEnd && minutesBetween(runStart, runEnd) >= minMinutes ? runEnd : null;
}

function isFree(timed: Block[], start: Date, minutes: number): boolean {
  const end = addMinutes(start, minutes);
  return !timed.some((b) => new Date(b.start) < end && new Date(b.end) > start);
}

function ceil15(d: Date): Date {
  const slot = 15 * 60_000;
  return new Date(Math.ceil(d.getTime() / slot) * slot);
}

function dayLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日`;
}
