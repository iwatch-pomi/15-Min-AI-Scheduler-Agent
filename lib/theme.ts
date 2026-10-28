// デザインの切り替え：やさしい（soft・万人向け）／ストイック（stoic・Winter Arc などに打ち込む人向け）

export type Theme = "soft" | "stoic";
export const THEME_COOKIE = "ai15-theme";

export function parseTheme(value: string | null | undefined): Theme {
  return value === "stoic" ? "stoic" : "soft";
}

/** 挑戦（Winter Arc など）。日付は YYYY-MM-DD */
export type Arc = { name: string; start: string; end: string };

/** 初期値：その年の 10/1〜12/31（92日） */
export function defaultArc(today: string): Arc {
  const year = today.slice(0, 4);
  return { name: "WINTER ARC", start: `${year}-10-01`, end: `${year}-12-31` };
}

export function isValidArc(a: Partial<Arc> | null | undefined): a is Arc {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  return !!a && typeof a.name === "string" && a.name.trim().length > 0 && a.name.length <= 30 &&
    typeof a.start === "string" && date.test(a.start) && typeof a.end === "string" && date.test(a.end) && a.start <= a.end;
}

const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

export type ArcProgress =
  | { status: "before"; total: number; daysLeft: number; ratio: 0 }
  | { status: "active"; total: number; day: number; ratio: number }
  | { status: "done"; total: number; ratio: 1 };

/** 何日目か（開始日が1日目）・全何日か・進み具合 */
export function arcProgress(arc: Arc, today: string): ArcProgress {
  const start = dayNumber(arc.start);
  const total = dayNumber(arc.end) - start + 1;
  const t = dayNumber(today);
  if (t < start) return { status: "before", total, daysLeft: start - t, ratio: 0 };
  if (t > dayNumber(arc.end)) return { status: "done", total, ratio: 1 };
  const day = t - start + 1;
  return { status: "active", total, day, ratio: day / total };
}

const LINES = {
  morning: ["まだ誰も動いていない時間に、差がつく。", "今日の一手目を、迷わず打て。", "昨日の自分を、今日で上書きする。"],
  day: ["集中は、才能じゃなく設計だ。", "決めたブロックを、決めたとおりに。", "疲れたら15分休む。止まりはしない。"],
  evening: ["最後の数ブロックが、差になる。", "言い訳より、次の15分。", "今日の残りを、取りこぼすな。"],
  night: ["今日もやり切った。休むのも訓練。", "眠るまでが、今日のメニュー。", "明日の自分に、いいバトンを。"],
};

/** 時間帯に合わせたひと言。同じ日・同じ時間帯なら同じ文 */
export function stoicLine(hour: number, date: string): string {
  const list = hour >= 5 && hour < 11 ? LINES.morning : hour >= 11 && hour < 17 ? LINES.day : hour >= 17 && hour < 21 ? LINES.evening : LINES.night;
  return list[dayNumber(date) % list.length];
}

/** 長さを短く（45m・1h30・8h） */
export function shortDuration(minutes: number): { value: string; unit: string } {
  if (minutes < 60) return { value: String(minutes), unit: "m" };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? { value: `${h}h${String(m).padStart(2, "0")}`, unit: "" } : { value: String(h), unit: "h" };
}
