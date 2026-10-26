import type { Block, BlockInput, BlockPatch } from "../types";
import type { CalendarBackend } from "./types";

// デモモードとテスト用。サーバープロセスのメモリに保存するので、再起動で消える。
const stores: Map<string, Map<string, Block>> =
  ((globalThis as Record<string, unknown>).__ai15MemoryCalendars as Map<string, Map<string, Block>>) ??
  new Map();
(globalThis as Record<string, unknown>).__ai15MemoryCalendars = stores;

export class MemoryCalendar implements CalendarBackend {
  private events: Map<string, Block>;

  constructor(userId: string, seed?: Block[]) {
    let events = stores.get(userId);
    if (!events) {
      events = new Map((seed ?? []).map((b) => [b.id, b]));
      stores.set(userId, events);
    }
    this.events = events;
  }

  async list(from: Date, to: Date): Promise<Block[]> {
    return [...this.events.values()]
      .filter((b) => new Date(b.end) > from && new Date(b.start) < to)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  async get(id: string): Promise<Block | null> {
    return this.events.get(id) ?? null;
  }

  async create(input: BlockInput): Promise<Block> {
    const block: Block = { id: crypto.randomUUID(), ai: true, ...normalize(input) };
    this.events.set(block.id, block);
    return block;
  }

  async update(id: string, patch: BlockPatch): Promise<Block> {
    const current = this.events.get(id);
    if (!current) throw new Error(`予定が見つかりません: ${id}`);
    const next = { ...current, ...normalize(patch) };
    this.events.set(id, next);
    return next;
  }

  async remove(id: string): Promise<void> {
    this.events.delete(id);
  }
}

function normalize<T extends BlockPatch>(input: T): T {
  const out = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as T;
  if (out.start) out.start = new Date(out.start).toISOString();
  if (out.end) out.end = new Date(out.end).toISOString();
  return out;
}
