import type { ChatMessage, Operation } from "../types";
import type { OpGroup, Store, StoredMessage } from "./types";

type MemoryData = {
  ops: Map<string, { userId: string } & OpGroup>;
  messages: Map<string, StoredMessage[]>;
  nextMessageId: number;
  usage: Map<string, number>;
};

const g = globalThis as Record<string, unknown>;
const data: MemoryData = (g.__ai15MemoryStore as MemoryData) ?? {
  ops: new Map(),
  messages: new Map(),
  usage: new Map(),
  nextMessageId: 1,
};
g.__ai15MemoryStore = data;

export class MemoryStore implements Store {
  async recordOps(userId: string, groupId: string, ops: Operation[]) {
    const entry = data.ops.get(groupId);
    if (entry && entry.userId === userId) entry.ops = [...entry.ops, ...ops];
    else data.ops.set(groupId, { userId, ops, undone: false });
  }

  async getOps(userId: string, groupId: string) {
    const entry = data.ops.get(groupId);
    return entry && entry.userId === userId && !entry.undone ? entry.ops : [];
  }

  async markUndone(userId: string, groupId: string) {
    const entry = data.ops.get(groupId);
    if (entry && entry.userId === userId) entry.undone = true;
  }

  async addMessages(userId: string, messages: ChatMessage[], groupId?: string) {
    const createdAt = new Date().toISOString();
    const stored = messages.map((m) => ({ ...m, id: String(data.nextMessageId++), opGroupId: groupId ?? null, createdAt }));
    data.messages.set(userId, [...(data.messages.get(userId) ?? []), ...stored]);
  }

  async recentMessages(userId: string, limit: number) {
    return (data.messages.get(userId) ?? []).slice(-limit).map(({ role, content }) => ({ role, content }));
  }

  async listMessages(userId: string, opts: { before?: string; limit: number }) {
    const all = data.messages.get(userId) ?? [];
    const older = opts.before ? all.filter((m) => Number(m.id) < Number(opts.before)) : all;
    return { messages: older.slice(-opts.limit), hasMore: older.length > opts.limit };
  }

  async getOpGroups(userId: string, groupIds: string[]) {
    const out = new Map<string, OpGroup>();
    for (const id of groupIds) {
      const entry = data.ops.get(id);
      if (entry && entry.userId === userId) out.set(id, { ops: entry.ops, undone: entry.undone });
    }
    return out;
  }

  async deleteMessages(userId: string) {
    data.messages.delete(userId);
  }

  async incrementUsage(userId: string, date: string) {
    const key = `${userId}:${date}`;
    const next = (data.usage.get(key) ?? 0) + 1;
    data.usage.set(key, next);
    return next;
  }

  async getUsage(userId: string, date: string) {
    return data.usage.get(`${userId}:${date}`) ?? 0;
  }
}
