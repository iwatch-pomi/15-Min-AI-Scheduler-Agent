import { applyInterrupt, ceil15, cleanTitle, interruptReply, normalizeText, plainWarning, takeDuration, type InterruptSettings } from "./interrupt";
import type { Theme } from "./theme";
import type { RecordingCalendar } from "./ops";
import { freeSlots, overlapping, planShift } from "./slots";
import type { Block } from "./types";
import { addDays, addMinutes, dayRange, localDateString, localTime, zonedToUtc } from "./time";

// 節約モード：決まった形の依頼は、AI を使わずにアプリで処理する（使用量を消費しない）。
// 読めない依頼・あいまいな依頼は null を返し、AI に任せる

export type LocalCommand =
  | { kind: "extend"; minutes: number }
  | { kind: "skip" }
  | { kind: "interrupt"; title: string; minutes: number }
  | { kind: "add"; title: string; minutes: number; day: number; time?: { h: number; m: number } };

const END = "(?:して|する|します|しました|です|ます|ください|下さい|お願い(?:します)?|ね|よ|[。．.!！\\s])*$";
/** 空き時間を探すときの、1日の始まり（ローカル時刻） */
const DAY_START_HOUR = 7;

/** 文を読み、アプリで処理できる形なら命令にする。できなければ null（AI に頼む） */
export function parseCommand(text: string): LocalCommand | null {
  const s = normalizeText(text);
  if (!s || s.length > 60 || /[?？]|教えて|確認|どう|何|いつ|ある/.test(s)) return null;

  // 「15分延長」「10分押してる」「遅れた」
  const ext = s.match(new RegExp(`^(?:(\\d+)\\s*分(?:だけ)?)?\\s*(?:延長|延ばして|伸ばして|のばして|押してる|押した|押し|遅れてる|遅れた|遅れ)${END}`));
  if (ext) return { kind: "extend", minutes: roundUp(Number(ext[1] ?? 15)) };

  // 「今のをスキップ」「今の予定はやめる」
  if (new RegExp(`^(?:今|いま)の(?:予定|ブロック|タスク)?(?:は|を)?\\s*(?:スキップ|やめる|やめた|やめて|なし|キャンセル|消して|削除)${END}`).test(s)) {
    return { kind: "skip" };
  }

  // 「割り込み30分」「割り込み 電話 15分」
  if (/^割り込み/.test(s)) {
    const d = takeDuration(s);
    return d ? { kind: "interrupt", title: cleanTitle(d.rest) || "割り込み", minutes: d.minutes } : null;
  }

  return parseAdd(s);
}

/** 「14時から要件定義1時間」「明日 資料作成 2時間」「15:00から90分、課題を入れて」 */
function parseAdd(s: string): LocalCommand | null {
  // 2つ以上の予定・あいまいな時間帯・期間の指定は AI に任せる
  if (/そのあと|その後|それから|あとで|および|\n|朝(?:に|の|から|一|イチ)|昼(?:に|の|から|過ぎ|前|頃)|夕方|夜(?:に|の|から)|午前|空いて|適当|どこか|いい感じ|来週|週末|毎日|毎週|[月火水木金土日]曜/.test(s.replace(/午後\s*\d/, ""))) {
    return null;
  }
  let rest = s;
  let day = 0;
  const dayMatch = rest.match(/(今日|きょう|明日|あした|あす|明後日|あさって)(?:は|の)?/);
  if (dayMatch) {
    day = /明後日|あさって/.test(dayMatch[1]) ? 2 : /明日|あした|あす/.test(dayMatch[1]) ? 1 : 0;
    rest = rest.replace(dayMatch[0], " ");
  }

  let time: { h: number; m: number } | undefined;
  // 「14時」「14時半」「14時30分」「14:30」「午後3時」（「1時間」は時刻ではない）
  const t = rest.match(/(午後)?\s*(\d{1,2})(?::(\d{2})|時(?!間)(半|(\d{1,2})分)?)\s*(?:から|より|〜|~)?/);
  if (t) {
    let h = Number(t[2]);
    if (t[1] && h < 12) h += 12;
    const m = t[3] !== undefined ? Number(t[3]) : t[4] === "半" ? 30 : Number(t[5] ?? 0);
    if (h > 23 || m > 59) return null;
    time = { h, m: Math.round(m / 15) * 15 };
    if (time.m === 60) time = { h: h + 1, m: 0 };
    if (time.h > 23) return null;
    rest = rest.replace(t[0], " ");
  }

  const d = takeDuration(rest);
  if (!d) return null;
  // 長さが2つ以上ある（予定が2つ以上ある）なら AI に任せる
  if (takeDuration(d.rest)) return null;
  const title = cleanTitle(
    d.rest.replace(/(?:を|の)?\s*(?:予定に)?(?:入れて|いれて|入れといて|追加して|追加|入れる|やる|する|したい|やりたい|ください|下さい|お願い(?:します)?|して)+[。！!\s]*$/, ""),
  );
  if (!title || title.length > 40 || /\d/.test(title)) return null;
  return { kind: "add", title, minutes: d.minutes, day, ...(time ? { time } : {}) };
}

function roundUp(minutes: number): number {
  return Math.min(8 * 60, Math.max(15, Math.ceil(minutes / 15) * 15));
}

const editable = (b: Block) => b.ai && !b.routine && !b.allDay;

/**
 * 命令を実行して、返事を返す。変更は RecordingCalendar を通すので［元に戻す］で戻せる。
 * アプリでは決められないとき（空き時間が見つからないなど）は、何も変えずに null を返す（AI に頼む）
 */
export async function runCommand(
  cmd: LocalCommand,
  calendar: RecordingCalendar,
  opts: { tz: string; now: Date; interrupt: InterruptSettings; tone?: Theme },
): Promise<string | null> {
  const { tz, now } = opts;
  // ストイックでは、コーチの口調（敬語なしの言い切り＋最後にひと言）で返す
  const stoic = opts.tone === "stoic";
  const coach = (soft: string, hard: string) => (stoic ? hard : soft);
  const today = localDateString(now, tz);
  const day = dayRange(today, tz);
  const hm = (d: Date | string) => localTime(new Date(d), tz);

  if (cmd.kind === "interrupt") {
    const r = await applyInterrupt(calendar, { title: cmd.title, minutes: cmd.minutes, tz, now, ...opts.interrupt });
    return interruptReply(r, opts.interrupt.mode, tz, opts.tone);
  }

  const blocks = (await calendar.list(addMinutes(day.start, -24 * 60), addMinutes(day.end, 24 * 60))).filter((b) => !b.allDay);
  const current = blocks.filter((b) => new Date(b.start) <= now && new Date(b.end) > now);

  if (cmd.kind === "skip") {
    const target = current.filter((b) => b.ai).at(-1);
    if (!target) {
      const fixed = current.at(-1);
      if (fixed) {
        return coach(
          `今の「${fixed.title}」はメインのカレンダーの予定なので、変更できません。`,
          `今の「${fixed.title}」はメインのカレンダーの予定だ。ここでは動かせない。`,
        );
      }
      return coach("今進行中の予定はありません。", "今進行中の予定はない。");
    }
    await calendar.remove(target);
    const range = `今の「${target.title}」（${hm(target.start)}-${hm(target.end)}）`;
    return coach(`${range}をスキップしました。`, `${range}を飛ばした。飛ばした分は、どこかで取り返せ。`);
  }

  if (cmd.kind === "extend") {
    const target = current.filter(editable).at(-1);
    const from = target ? new Date(target.end) : ceil15(now);
    const plan = planShift(blocks.filter((b) => b.id !== target?.id), from, cmd.minutes, day.end);
    if (!target && !plan.length) {
      return coach("今進行中の予定も、このあとの AI の予定もないので、ずらすものはありませんでした。", "今進行中の予定も、このあとの AI の予定もない。ずらすものはない。");
    }
    if (target) await calendar.update(target, { end: addMinutes(new Date(target.end), cmd.minutes).toISOString() });
    for (const p of plan) await calendar.update(p.block, { start: p.start.toISOString(), end: p.end.toISOString() });
    const fixed = blocks.filter((b) => !editable(b));
    const warnings = plan.flatMap((p) =>
      overlapping(fixed, p.start, p.end).map((c) => `⚠ ずらした「${p.block.title}」が「${c.title}」と${coach("重なりました", "重なった")}`),
    );
    const until = target ? hm(addMinutes(new Date(target.end), cmd.minutes)) : "";
    const head = target ? coach(`「${target.title}」を${cmd.minutes}分延長して ${until} までにしました。`, `「${target.title}」を${cmd.minutes}分延長し、${until} までにした。`) : "";
    const tail = plan.length ? coach(`後ろの予定を${cmd.minutes}分ずらしました（${plan.length}件）。`, `後ろの予定${target ? "も" : "を"}${cmd.minutes}分ずらした（${plan.length}件）。`) : "";
    const push = stoic && target ? "延長はこれで最後にしろ。" : "";
    return [head + tail + push, ...new Set(warnings)].join("\n");
  }

  // 予定を1つ入れる
  const date = addDays(today, cmd.day);
  const range = dayRange(date, tz);
  let start: Date;
  if (cmd.time) {
    start = zonedToUtc(date, cmd.time.h, cmd.time.m, tz);
  } else {
    // 時刻の指定がなければ、今（明日以降は朝）からの最初の空き
    let from = zonedToUtc(date, DAY_START_HOUR, 0, tz);
    if (now > from) from = ceil15(now);
    const others = cmd.day === 0 ? blocks : await calendar.list(range.start, range.end);
    const slot = from < range.end ? freeSlots(others, from, range.end, cmd.minutes)[0] : undefined;
    if (!slot) return null;
    start = slot.start;
  }
  const end = addMinutes(start, cmd.minutes);
  const existing = cmd.time ? await calendar.list(start, end) : [];
  const block = await calendar.create({ title: cmd.title, start: start.toISOString(), end: end.toISOString(), energy: "MEDIUM" });
  const when = cmd.day === 0 ? "" : cmd.day === 1 ? "明日の" : "明後日の";
  const placed = `${when}${hm(start)}-${hm(end)} に「${block.title}」を入れ`;
  const lines = [coach(`${placed}ました。`, `${placed}た。始めたら、終わるまで離れるな。`)];
  const clash = overlapping(existing, start, end);
  if (clash.length) {
    const warning = `⚠ ${clash.map((c) => `「${c.title}」`).join("、")}と重なっています`;
    lines.push(stoic ? plainWarning(warning) : warning);
  }
  return lines.join("\n");
}
