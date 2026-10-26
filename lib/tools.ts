import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { RecordingCalendar } from "./ops";
import { freeSlots, overlapping, planShift } from "./slots";
import type { Block } from "./types";
import {
  SLOT_MINUTES,
  addDays,
  addMinutes,
  dayRange,
  localDateString,
  minutesBetween,
  parseTimeInput,
  snapToSlot,
  toLocalIso,
  zonedToUtc,
} from "./time";

/** 空き枠を計算する1日の時間帯（ローカル時刻） */
const DAY_START_HOUR = 7;
const MAX_RANGE_DAYS = 14;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const energy = z.enum(["HIGH", "MEDIUM", "LOW"]);
const minutes = z.number().int().min(SLOT_MINUTES).max(8 * 60);

const schemas = {
  get_schedule: z.object({
    from: dateStr.describe("開始日 YYYY-MM-DD（ローカル）"),
    to: dateStr.describe("終了日 YYYY-MM-DD（この日を含む）"),
  }),
  create_blocks: z.object({
    blocks: z
      .array(
        z.object({
          title: z.string().min(1).max(100).describe("具体的なアクション名"),
          start: z.string().describe("開始時刻。オフセット付き ISO（例: 2026-10-26T13:00+09:00）"),
          minutes: minutes.describe("長さ（分）。15の倍数"),
          energy: energy.describe("必要な集中度"),
        }),
      )
      .min(1)
      .max(20),
  }),
  update_block: z.object({
    id: z.string(),
    title: z.string().min(1).max(100).optional(),
    start: z.string().optional().describe("新しい開始時刻。長さは保ったまま動く"),
    minutes: minutes.optional().describe("新しい長さ（分）"),
  }),
  delete_block: z.object({ id: z.string() }),
  shift_following: z.object({
    from: z.string().describe("この時刻以降に始まるAIブロックが対象（オフセット付き ISO）"),
    minutes: z.number().int().min(-8 * 60).max(8 * 60).describe("ずらす分数。正で後ろ倒し、負で前倒し。15の倍数"),
  }),
};

type ToolName = keyof typeof schemas;

const descriptions: Record<ToolName, string> = {
  get_schedule:
    "指定期間の予定と空き枠（15分単位）を返す。予定を書き込む前に必ず呼ぶ。ai=true がこのアプリで作ったブロック（動かせる）、ai=false は Google の既存予定（動かせない）。",
  create_blocks: "タイムブロックをまとめて作成する。開始は15分刻みに、長さは15の倍数に丸められる。",
  update_block: "AIブロック（ai=true）のタイトル・開始時刻・長さを変える。",
  delete_block: "AIブロック（ai=true）を削除する。",
  shift_following:
    "指定時刻以降・同じ日のうちに始まるAIブロックをまとめて前後にずらす。延長・遅れ・割り込みのときに使う。Google の既存予定は動かない。",
};

export const toolDefinitions: Anthropic.Beta.BetaTool[] = (Object.keys(schemas) as ToolName[]).map((name) => {
  const input_schema = z.toJSONSchema(schemas[name]) as Record<string, unknown>;
  delete input_schema.$schema;
  return {
    name,
    description: descriptions[name],
    input_schema: input_schema as Anthropic.Beta.BetaTool.InputSchema,
  };
});

export type ToolContext = { calendar: RecordingCalendar; tz: string; now: Date };

export class ToolError extends Error {}

/** tool を実行して、AI に返す JSON（文字列化する前のオブジェクト）を返す */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<unknown> {
  if (!(name in schemas)) throw new ToolError(`未知のツール: ${name}`);
  const parsed = schemas[name as ToolName].safeParse(rawInput);
  if (!parsed.success) throw new ToolError(`入力が不正です: ${z.prettifyError(parsed.error)}`);
  const input = parsed.data;

  switch (name as ToolName) {
    case "get_schedule":
      return getSchedule(input as z.infer<typeof schemas.get_schedule>, ctx);
    case "create_blocks":
      return createBlocks(input as z.infer<typeof schemas.create_blocks>, ctx);
    case "update_block":
      return updateBlock(input as z.infer<typeof schemas.update_block>, ctx);
    case "delete_block":
      return deleteBlock(input as z.infer<typeof schemas.delete_block>, ctx);
    case "shift_following":
      return shiftFollowing(input as z.infer<typeof schemas.shift_following>, ctx);
  }
}

function view(b: Block, tz: string) {
  return {
    id: b.id,
    title: b.title,
    start: b.allDay ? b.start.slice(0, 10) : toLocalIso(new Date(b.start), tz),
    end: b.allDay ? b.end.slice(0, 10) : toLocalIso(new Date(b.end), tz),
    minutes: b.allDay ? undefined : minutesBetween(new Date(b.start), new Date(b.end)),
    ai: b.ai,
    energy: b.energy,
    allDay: b.allDay || undefined,
  };
}

async function getSchedule(input: { from: string; to: string }, { calendar, tz, now }: ToolContext) {
  const days: string[] = [];
  for (let d = input.from; d <= input.to && days.length < MAX_RANGE_DAYS; d = addDays(d, 1)) days.push(d);
  if (!days.length) throw new ToolError("from は to 以前の日付にしてください");

  const start = dayRange(days[0], tz).start;
  const end = dayRange(days[days.length - 1], tz).end;
  const blocks = await calendar.list(start, end);

  return {
    days: days.map((date) => {
      const range = dayRange(date, tz);
      const inDay = blocks.filter((b) =>
        b.allDay ? b.start.slice(0, 10) === date : new Date(b.start) < range.end && new Date(b.end) > range.start,
      );
      // 今日なら「今」以降、それ以外は朝 DAY_START_HOUR 時以降の空きを出す
      let freeFrom = zonedToUtc(date, DAY_START_HOUR, 0, tz);
      if (now > freeFrom) freeFrom = ceilToSlot(now);
      const free = freeFrom < range.end ? freeSlots(inDay, freeFrom, range.end) : [];
      return {
        date,
        events: inDay.map((b) => view(b, tz)),
        free: free.map((s) => ({
          start: toLocalIso(s.start, tz),
          end: toLocalIso(s.end, tz),
          minutes: minutesBetween(s.start, s.end),
        })),
      };
    }),
  };
}

async function createBlocks(input: z.infer<typeof schemas.create_blocks>, { calendar, tz }: ToolContext) {
  const prepared = input.blocks.map((b) => {
    const start = parseStart(b.start, tz);
    return { ...b, start, end: addMinutes(start, roundMinutes(b.minutes)) };
  });
  const from = new Date(Math.min(...prepared.map((b) => b.start.getTime())));
  const to = new Date(Math.max(...prepared.map((b) => b.end.getTime())));
  const existing = await calendar.list(from, to);

  const created = [];
  const warnings: string[] = [];
  for (const b of prepared) {
    const clash = overlapping(existing, b.start, b.end);
    if (clash.length) warnings.push(`「${b.title}」が ${clash.map((c) => `「${c.title}」`).join("、")} と重なっています`);
    const block = await calendar.create({
      title: b.title,
      start: b.start.toISOString(),
      end: b.end.toISOString(),
      energy: b.energy,
    });
    existing.push(block);
    created.push(view(block, tz));
  }
  return { created, warnings };
}

async function updateBlock(input: z.infer<typeof schemas.update_block>, { calendar, tz }: ToolContext) {
  const block = await requireAiBlock(calendar, input.id);
  const oldStart = new Date(block.start);
  const duration = input.minutes ? roundMinutes(input.minutes) : minutesBetween(oldStart, new Date(block.end));
  const start = input.start ? parseStart(input.start, tz) : oldStart;
  const end = addMinutes(start, duration);
  const updated = await calendar.update(block, {
    title: input.title,
    start: start.toISOString(),
    end: end.toISOString(),
  });
  return { updated: view(updated, tz) };
}

async function deleteBlock(input: { id: string }, { calendar, tz }: ToolContext) {
  const block = await requireAiBlock(calendar, input.id);
  await calendar.remove(block);
  return { deleted: view(block, tz) };
}

async function shiftFollowing(input: z.infer<typeof schemas.shift_following>, { calendar, tz }: ToolContext) {
  if (input.minutes === 0 || input.minutes % SLOT_MINUTES !== 0) throw new ToolError("minutes は0以外の15の倍数にしてください");
  const from = parseTime(input.from, tz);
  const dayEnd = dayRange(localDateString(from, tz), tz).end;
  // 後ろ倒しで日をまたぐ予定との重なりも見たいので、少し先まで取得する
  const blocks = await calendar.list(addMinutes(from, -8 * 60), addMinutes(dayEnd, 8 * 60));
  const plan = planShift(blocks, from, input.minutes, dayEnd);

  const moved = [];
  for (const p of plan) {
    const updated = await calendar.update(p.block, { start: p.start.toISOString(), end: p.end.toISOString() });
    moved.push(view(updated, tz));
  }

  const fixed = blocks.filter((b) => !b.ai);
  const warnings = plan.flatMap((p) => {
    const clash = overlapping(fixed, p.start, p.end);
    return clash.length ? [`「${p.block.title}」が ${clash.map((c) => `「${c.title}」`).join("、")} と重なりました`] : [];
  });
  const overflow = plan.filter((p) => p.end > dayEnd).map((p) => `「${p.block.title}」が日付をまたぎました`);
  return { moved, warnings: [...warnings, ...overflow] };
}

async function requireAiBlock(calendar: RecordingCalendar, id: string): Promise<Block> {
  const block = await calendar.get(id);
  if (!block) throw new ToolError(`予定が見つかりません: ${id}`);
  if (!block.ai) throw new ToolError(`「${block.title}」は Google の既存予定なので変更できません`);
  return block;
}

function parseTime(value: string, tz: string): Date {
  const date = parseTimeInput(value, tz);
  if (!date) throw new ToolError(`時刻の形式が不正です: ${value}`);
  return date;
}

function parseStart(value: string, tz: string): Date {
  return snapToSlot(parseTime(value, tz));
}

function roundMinutes(m: number): number {
  return Math.max(SLOT_MINUTES, Math.ceil(m / SLOT_MINUTES) * SLOT_MINUTES);
}

function ceilToSlot(date: Date): Date {
  const slot = SLOT_MINUTES * 60_000;
  return new Date(Math.ceil(date.getTime() / slot) * slot);
}
