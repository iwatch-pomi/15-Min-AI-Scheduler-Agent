// タイムゾーンまわりの小さなヘルパー。サーバーは UTC で動くので、
// 「ユーザーの tz での日付・時刻」との変換はすべてここを通す。

export const DEFAULT_TZ = "Asia/Tokyo";
export const SLOT_MINUTES = 15;
const MINUTE = 60_000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(tz: string | null | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TZ;
}

/** date の時点での tz の UTC オフセット（分）。東京なら +540 */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** tz での「YYYY-MM-DD hh:mm」を UTC の Date にする */
export function zonedToUtc(dateStr: string, hour: number, minute: number, tz: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, hour, minute);
  let utc = guess - tzOffsetMinutes(new Date(guess), tz) * MINUTE;
  // 夏時間の切り替え付近ではオフセットが変わるので1回だけ補正
  const corrected = guess - tzOffsetMinutes(new Date(utc), tz) * MINUTE;
  if (corrected !== utc) utc = corrected;
  return new Date(utc);
}

/** tz での日付文字列（YYYY-MM-DD） */
export function localDateString(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** tz での1日の範囲 [start, end) */
export function dayRange(dateStr: string, tz: string): { start: Date; end: Date } {
  return { start: zonedToUtc(dateStr, 0, 0, tz), end: zonedToUtc(addDays(dateStr, 1), 0, 0, tz) };
}

/** AI に見せる用の、オフセット付きローカル時刻（例: 2026-10-26T13:00+09:00） */
export function toLocalIso(date: Date, tz: string): string {
  const off = tzOffsetMinutes(date, tz);
  const local = new Date(date.getTime() + off * MINUTE).toISOString().slice(0, 16);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** tz での HH:mm */
export function localTime(date: Date, tz: string): string {
  return toLocalIso(date, tz).slice(11, 16);
}

/**
 * AI やクライアントから来た時刻文字列を Date にする。
 * オフセットが無い「2026-10-26T13:00」は tz のローカル時刻として扱う。
 */
export function parseTimeInput(value: string, tz: string): Date | null {
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(value)) {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : new Date(t);
  }
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  return zonedToUtc(m[1], Number(m[2]), Number(m[3]), tz);
}

/** 15分単位に丸める（四捨五入） */
export function snapToSlot(date: Date): Date {
  const slot = SLOT_MINUTES * MINUTE;
  return new Date(Math.round(date.getTime() / slot) * slot);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MINUTE);
}

/** "YYYY-MM-DD" の月（"YYYY-MM"） */
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** "YYYY-MM" の次の月 */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
