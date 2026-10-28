import { firstDate, weekdayOf, type Routine, type RoutineInput } from "../routines";
import { DEFAULT_TZ, addDays, addMinutes, localDateString, zonedToUtc } from "../time";
import type { Block, BlockInput, BlockPatch } from "../types";
import type { CalendarBackend } from "./types";

// デモモードとテスト用。サーバープロセスのメモリに保存するので、再起動で消える。

type StoredRoutine = Routine & { tz: string; from: string; until?: string };
type State = {
  events: Map<string, Block>;
  routines: Map<string, StoredRoutine>;
  /** ルーティンの1回分を動かした・消したもの（id → 予定。null は「その日はなし」） */
  exceptions: Map<string, Block | null>;
};

const g = globalThis as Record<string, unknown>;
const stores: Map<string, State> = (g.__ai15MemoryCalendars2 as Map<string, State>) ?? new Map();
g.__ai15MemoryCalendars2 = stores;

export class MemoryCalendar implements CalendarBackend {
  private s: State;

  constructor(userId: string, seed?: Block[]) {
    let state = stores.get(userId);
    if (!state) {
      state = { events: new Map((seed ?? []).map((b) => [b.id, b])), routines: new Map(), exceptions: new Map() };
      stores.set(userId, state);
    }
    this.s = state;
  }

  async list(from: Date, to: Date): Promise<Block[]> {
    const singles = [...this.s.events.values()];
    return [...singles, ...this.occurrences(from, to)]
      .filter((b) => new Date(b.end) > from && new Date(b.start) < to)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  async get(id: string): Promise<Block | null> {
    return this.s.events.get(id) ?? this.occurrence(id);
  }

  async create(input: BlockInput): Promise<Block> {
    const block: Block = { id: crypto.randomUUID(), ai: true, ...normalize(input) };
    this.s.events.set(block.id, block);
    return block;
  }

  async update(id: string, patch: BlockPatch): Promise<Block> {
    const single = this.s.events.get(id);
    if (single) {
      const next = { ...single, ...normalize(patch) };
      this.s.events.set(id, next);
      return next;
    }
    const occ = this.occurrence(id);
    if (!occ) throw Object.assign(new Error(`予定が見つかりません: ${id}`), { code: 404 });
    const next = { ...occ, ...normalize(patch) };
    this.s.exceptions.set(id, next);
    return next;
  }

  async remove(id: string): Promise<void> {
    if (this.s.events.delete(id)) return;
    if (this.occurrence(id)) this.s.exceptions.set(id, null);
  }

  async restore(block: Block): Promise<Block> {
    if (block.routine) this.s.exceptions.set(block.id, block);
    else this.s.events.set(block.id, block);
    return block;
  }

  async listRoutines(): Promise<Routine[]> {
    const today = localDateString(new Date(), DEFAULT_TZ);
    return [...this.s.routines.values()]
      .filter((r) => !r.until || r.until >= today)
      .map(({ id, title, time, minutes, days }) => ({ id, title, time, minutes, days }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  async createRoutine(input: RoutineInput, tz: string): Promise<Routine> {
    const routine: StoredRoutine = { id: `r${crypto.randomUUID().slice(0, 8)}`, ...input, tz, from: firstDate(localDateString(new Date(), tz), input.days) };
    this.s.routines.set(routine.id, routine);
    const { id, title, time, minutes, days } = routine;
    return { id, title, time, minutes, days };
  }

  async updateRoutine(id: string, input: RoutineInput, tz: string): Promise<Routine> {
    await this.deleteRoutine(id, tz);
    return this.createRoutine(input, tz);
  }

  async deleteRoutine(id: string, tz: string): Promise<void> {
    const r = this.s.routines.get(id);
    if (!r) throw Object.assign(new Error("ルーティンが見つかりません"), { code: 404 });
    const today = localDateString(new Date(), tz);
    if (r.from >= today) this.s.routines.delete(id);
    else r.until = addDays(today, -1);
  }

  /** [from, to) にかかるルーティンの各回 */
  private occurrences(from: Date, to: Date): Block[] {
    const out: Block[] = [];
    for (const r of this.s.routines.values()) {
      let d = localDateString(addMinutes(from, -24 * 60), r.tz);
      const last = localDateString(to, r.tz);
      for (; d <= last; d = addDays(d, 1)) {
        const id = `${r.id}_${d.replace(/-/g, "")}`;
        const b = this.occurrence(id);
        if (b) out.push(b);
      }
    }
    return out;
  }

  /** 「ルーティンid_YYYYMMDD」の1回分。動かしたものはその内容、消したものや範囲外は null */
  private occurrence(id: string): Block | null {
    const m = id.match(/^(r[\w-]+)_(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    const r = this.s.routines.get(m[1]);
    const date = `${m[2]}-${m[3]}-${m[4]}`;
    if (!r || date < r.from || (r.until && date > r.until) || !r.days.includes(weekdayOf(date))) return null;
    if (this.s.exceptions.has(id)) return this.s.exceptions.get(id) ?? null;
    const [h, min] = r.time.split(":").map(Number);
    const start = zonedToUtc(date, h, min, r.tz);
    return { id, title: r.title, start: start.toISOString(), end: addMinutes(start, r.minutes).toISOString(), ai: true, routine: true };
  }
}

function normalize<T extends BlockPatch>(input: T): T {
  const out = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as T;
  if (out.start) out.start = new Date(out.start).toISOString();
  if (out.end) out.end = new Date(out.end).toISOString();
  return out;
}
