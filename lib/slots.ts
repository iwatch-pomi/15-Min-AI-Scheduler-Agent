import type { Block } from "./types";
import { addMinutes } from "./time";

export type Slot = { start: Date; end: Date };

/**
 * [from, to) の中で、どの予定とも重ならない時間帯を返す。
 * 終日予定は時間を塞がないものとして無視する。
 */
export function freeSlots(blocks: Block[], from: Date, to: Date, minMinutes = 15): Slot[] {
  const busy = blocks
    .filter((b) => !b.allDay)
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
    .filter((b) => b.end > from && b.start < to)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const result: Slot[] = [];
  let cursor = from;
  for (const b of busy) {
    if (b.start > cursor) pushSlot(result, cursor, b.start, minMinutes);
    if (b.end > cursor) cursor = b.end;
  }
  if (cursor < to) pushSlot(result, cursor, to, minMinutes);
  return result;
}

function pushSlot(out: Slot[], start: Date, end: Date, minMinutes: number) {
  if (end.getTime() - start.getTime() >= minMinutes * 60_000) out.push({ start, end });
}

/**
 * 延長・割り込み用：from 以降に始まる AI ブロックを minutes 分ずらす計画を返す。
 * until を渡すとその時刻より前に始まるブロックだけが対象（通常は「その日の終わり」）。
 * Google の既存予定（ai=false）は動かさない。
 */
export function planShift(
  blocks: Block[],
  from: Date,
  minutes: number,
  until?: Date,
): { block: Block; start: Date; end: Date }[] {
  return blocks
    // ルーティンは、ユーザーが頼んだときだけ動かすので、まとめてずらす対象にしない
    .filter((b) => b.ai && !b.allDay && !b.routine)
    .filter((b) => new Date(b.start) >= from && (!until || new Date(b.start) < until))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => ({
      block: b,
      start: addMinutes(new Date(b.start), minutes),
      end: addMinutes(new Date(b.end), minutes),
    }));
}

/** 指定の時間帯と重なる予定 */
export function overlapping(blocks: Block[], start: Date, end: Date, excludeId?: string): Block[] {
  return blocks.filter(
    (b) => !b.allDay && b.id !== excludeId && new Date(b.start) < end && new Date(b.end) > start,
  );
}

/** 重なる予定を横に並べるためのレーン割り当て（タイムライン描画用） */
export function assignLanes(blocks: Block[]): Map<string, { lane: number; lanes: number }> {
  const sorted = blocks
    .filter((b) => !b.allDay)
    .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const result = new Map<string, { lane: number; lanes: number }>();

  let group: { block: Block; lane: number }[] = [];
  let groupEnd = "";
  let laneEnds: string[] = [];

  const flush = () => {
    const lanes = laneEnds.length;
    for (const g of group) result.set(g.block.id, { lane: g.lane, lanes });
    group = [];
    laneEnds = [];
  };

  for (const b of sorted) {
    if (group.length && b.start >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= b.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.end);
    } else {
      laneEnds[lane] = b.end;
    }
    group.push({ block: b, lane });
    groupEnd = group.length === 1 || b.end > groupEnd ? b.end : groupEnd;
  }
  flush();
  return result;
}
