import type { RecordingCalendar } from "./ops";
import { overlapping, planShift } from "./slots";
import type { Block } from "./types";
import { SLOT_MINUTES, addMinutes, dayRange, localDateString, localTime, minutesBetween } from "./time";

// 割り込み：いま（または今の予定の直後）から、予定を割り込ませる。AI は使わない。
// 動かすのは AI の予定だけ（メインのカレンダーの予定とルーティンは動かさない）

export type InterruptStart = "now" | "after_current";
export type InterruptMode = "slide" | "trim";
export type InterruptSettings = { start: InterruptStart; mode: InterruptMode };
/**
 * AI の使い方。
 * save＝節約（アプリで処理し、読めないときだけ AI。Sonnet）／normal＝通常（いつも AI。Sonnet）／boost＝強化（いつも AI。Opus）
 */
export type AiMode = "save" | "normal" | "boost";
export const AI_MODES: AiMode[] = ["save", "normal", "boost"];

/** AI 画面の設定（この端末に保存する） */
export type ChatSettings = InterruptSettings & { interrupt: boolean; aiMode: AiMode };
export const DEFAULT_CHAT_SETTINGS: ChatSettings = { interrupt: false, start: "now", mode: "slide", aiMode: "save" };

export const AI_MODE_HELP: Record<AiMode, string> = {
  save: "「14時から会議1時間」「明日 資料作成2時間」「15分延長」「今のをスキップ」「割り込み30分」のような決まった形の依頼は、AIを使わずにアプリで処理します（使用量は減りません）。それ以外は安いAI（Haiku）が考え、「組み直して」のような難しい依頼だけ Sonnet に回します",
  normal: "すべての依頼をAI（Sonnet）が考えます。予定の分け方や空き時間の選び方まで任せられ、そのたびに使用量を消費します",
  boost: "すべての依頼を、いちばん賢いAI（Opus）が考えます。複雑な組み直しに強い分、使用量は通常のおよそ2倍です",
};

/** 節約モードで、AI を使わずに処理されやすい書き方のコツ（マイページ・AI 画面に出す） */
export const SAVE_TIP = "使用量を節約したいときは、「14時から〇〇1時間」のように時刻と長さをはっきり書いて1件ずつ送ると、AIを使わずに処理されやすくなります。";

/** 履歴に残すユーザーの発言（AI にも割り込みだったことが伝わる） */
export const interruptLabel = (message: string) => `⚡割り込み：${message}`;

/** AI に割り込みを頼むときに、依頼文の前に付ける指示 */
export function interruptInstruction({ start, mode }: InterruptSettings): string {
  const s = start === "now" ? "今すぐ（start=now）" : "今の予定の直後（start=after_current）";
  const m = mode === "slide" ? "スライド（mode=slide）" : "削る（mode=trim）";
  return `［割り込みモード］開始：${s}／後ろの予定：${m}。次の依頼を interrupt ツールで割り込ませること。`;
}

const MAX_MINUTES = 8 * 60;

/** 全角の数字・コロン・空白をそろえる */
export function normalizeText(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ":")
    .replace(/[　]/g, " ")
    .trim();
}

/**
 * 文から長さ（「45分」「1時間」「1時間半」「1時間30分」「半時間」）を1つ取り出す。
 * 15分単位に切り上げ、最大8時間。読めなければ null
 */
export function takeDuration(s: string): { minutes: number; rest: string } | null {
  let minutes = 0;
  let rest = s;
  const hours = s.match(/(\d+(?:\.\d+)?)\s*時間(半)?(?:\s*(\d+)\s*分)?/);
  if (hours) {
    minutes = Number(hours[1]) * 60 + (hours[2] ? 30 : 0) + Number(hours[3] ?? 0);
    rest = s.replace(hours[0], " ");
  } else {
    const mins = s.match(/(\d+)\s*(?:分|min|mins|minutes)/i);
    if (mins) {
      minutes = Number(mins[1]);
      rest = s.replace(mins[0], " ");
    } else if (/半時間/.test(s)) {
      minutes = 30;
      rest = s.replace("半時間", " ");
    }
  }
  if (!minutes) return null;
  return { minutes: Math.min(MAX_MINUTES, Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES), rest };
}

/** 依頼文の前後の助詞・「くらい」などを取って、予定のタイトルにする */
export function cleanTitle(s: string): string {
  return s
    .replace(/割り込み[:：]?/g, " ")
    .replace(/^[\s、,。:：をでのにだけ]+/, "")
    .replace(/[\s、,。をでのに]*(くらい|ぐらい|ほど|程度|だけ)?[\s、,。をでのに]*$/, "")
    .trim();
}

/**
 * 「45分買い物」「買い物 1時間」「1時間半 散歩」から長さとタイトルを読む。
 * 長さが読めなければ null（そのときは AI に頼む）
 */
export function parseInterrupt(text: string): { title: string; minutes: number } | null {
  const d = takeDuration(normalizeText(text));
  if (!d) return null;
  return { title: cleanTitle(d.rest) || "割り込み", minutes: d.minutes };
}

export function ceil15(d: Date): Date {
  const slot = SLOT_MINUTES * 60_000;
  return new Date(Math.ceil(d.getTime() / slot) * slot);
}

const editable = (b: Block) => b.ai && !b.routine && !b.allDay;
const continuationTitle = (t: string) => (t.endsWith("（続き）") ? t : `${t}（続き）`);

export type InterruptResult = {
  block: Block;
  start: Date;
  end: Date;
  /** 後ろにずらした予定（スライド）／削った・縮めた予定（削る）の数 */
  moved: number;
  trimmed: number;
  deleted: number;
  continued: number;
  warnings: string[];
};

export async function applyInterrupt(
  calendar: RecordingCalendar,
  opts: { title: string; minutes: number; tz: string; now: Date } & InterruptSettings,
): Promise<InterruptResult> {
  const { title, minutes, tz, now } = opts;
  const day = dayRange(localDateString(now, tz), tz);
  const blocks = await calendar.list(addMinutes(day.start, -24 * 60), addMinutes(day.end, 24 * 60));
  const timed = blocks.filter((b) => !b.allDay);

  // 開始時刻：今すぐ（次の15分の区切り）か、進行中の予定のうちいちばん遅く終わるものの直後
  let start = ceil15(now);
  if (opts.start === "after_current") {
    const current = timed.filter((b) => new Date(b.start) <= now && new Date(b.end) > now);
    if (current.length) start = ceil15(new Date(Math.max(...current.map((b) => new Date(b.end).getTime()))));
  }
  const end = addMinutes(start, minutes);
  const result = { moved: 0, trimmed: 0, deleted: 0, continued: 0 };
  const continuations: { title: string; minutes: number; energy?: Block["energy"] }[] = [];

  if (opts.mode === "slide") {
    // 開始時刻以降に始まる AI の予定は、割り込みの長さだけ後ろへ（その日のうちに始まるもの）
    for (const p of planShift(timed, start, minutes, day.end)) {
      await calendar.update(p.block, { start: p.start.toISOString(), end: p.end.toISOString() });
      result.moved++;
    }
    // 開始時刻をまたいで進行中の AI の予定は、そこで切り、残りを割り込みの直後に置く
    for (const b of timed.filter((b) => editable(b) && new Date(b.start) < start && new Date(b.end) > start)) {
      await calendar.update(b, { end: start.toISOString() });
      continuations.push({ title: continuationTitle(b.title), minutes: minutesBetween(start, new Date(b.end)), energy: b.energy });
      result.trimmed++;
    }
  } else {
    // 重なった分だけ削る。そのあとの予定は動かさない
    for (const b of timed.filter((b) => editable(b) && new Date(b.start) < end && new Date(b.end) > start)) {
      const bs = new Date(b.start);
      const be = new Date(b.end);
      if (bs >= start && be <= end) {
        await calendar.remove(b);
        result.deleted++;
      } else if (bs < start && be <= end) {
        await calendar.update(b, { end: start.toISOString() });
        result.trimmed++;
      } else if (bs >= start) {
        await calendar.update(b, { start: end.toISOString() });
        result.trimmed++;
      } else {
        // 割り込みをまたぐ：前半を残し、後半は「（続き）」として割り込みの後ろに
        await calendar.update(b, { end: start.toISOString() });
        await calendar.create({ title: continuationTitle(b.title), start: end.toISOString(), end: be.toISOString(), energy: b.energy });
        result.trimmed++;
        result.continued++;
      }
    }
  }

  // 続きを、割り込みの直後から順に置く（スライド）
  let cursor = end;
  for (const c of continuations) {
    const cEnd = addMinutes(cursor, c.minutes);
    await calendar.create({ title: c.title, start: cursor.toISOString(), end: cEnd.toISOString(), energy: c.energy });
    result.continued++;
    cursor = cEnd;
  }

  const block = await calendar.create({ title, start: start.toISOString(), end: end.toISOString(), energy: "MEDIUM" });

  // 動かせない予定（メイン・ルーティン）と重なったら知らせる
  const fixed = timed.filter((b) => !editable(b));
  const label = (b: Block) => `「${b.title}」（${b.routine ? "ルーティン" : "メインの予定"}）`;
  const warnings = overlapping(fixed, start, end).map((b) => `割り込みが${label(b)}と重なっています`);
  if (opts.mode === "slide") {
    const after = await calendar.list(end, day.end);
    for (const b of after.filter(editable)) {
      const clash = overlapping(fixed, new Date(b.start), new Date(b.end));
      for (const c of clash) warnings.push(`ずらした「${b.title}」が${label(c)}と重なりました`);
    }
  }
  return { block, start, end, ...result, warnings: [...new Set(warnings)] };
}

/** AI を使わずに処理したときの返事 */
export function interruptReply(r: InterruptResult, mode: InterruptMode, tz: string): string {
  const lines = [`${localTime(r.start, tz)}-${localTime(r.end, tz)} に「${r.block.title}」を割り込ませました。`];
  const minutes = minutesBetween(r.start, r.end);
  if (mode === "slide") {
    if (r.moved) lines.push(`後ろの予定を${minutes}分ずらしました（${r.moved}件）。`);
    if (r.continued) lines.push("途中だった予定の残りは、割り込みのあとに「（続き）」として入れました。");
    if (!r.moved && !r.continued) lines.push("後ろにずらす予定はありませんでした。");
  } else {
    const parts = [];
    if (r.trimmed) parts.push(`${r.trimmed}件を短く`);
    if (r.deleted) parts.push(`${r.deleted}件を削除`);
    lines.push(parts.length ? `重なった予定を${parts.join("、")}しました。` : "重なる予定はありませんでした。");
  }
  return [...lines, ...r.warnings.map((w) => `⚠ ${w}`)].join("\n");
}
