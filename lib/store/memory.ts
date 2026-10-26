import type { ChatMessage, Operation } from "../types";
import type { Store } from "./types";

type MemoryData = {
  ops: Map<string, { userId: string; ops: Operation[]; undone: boolean }>;
  messages: Map<string, ChatMessage[]>;
  usage: Map<string, number>;
};

const g = globalThis as Record<string, unknown>;
const data: MemoryData = (g.__ai15MemoryStore as MemoryData) ?? {
  ops: new Map(),
  messages: new Map(),
  usage: new Map(),
};
g.__ai15MemoryStore = data;

export class MemoryStore implements Store {
  async recordOps(userId: string, groupId: string, ops: Operation[]) {
    data.ops.set(groupId, { userId, ops, undone: false });
  }

  async getOps(userId: string, groupId: string) {
    const entry = data.ops.get(groupId);
    return entry && entry.userId === userId && !entry.undone ? entry.ops : [];
  }

  async markUndone(userId: string, groupId: string) {
    const entry = data.ops.get(groupId);
    if (entry && entry.userId === userId) entry.undone = true;
  }

  async addMessages(userId: string, messages: ChatMessage[]) {
    data.messages.set(userId, [...(data.messages.get(userId) ?? []), ...messages]);
  }

  async recentMessages(userId: string, limit: number) {
    return (data.messages.get(userId) ?? []).slice(-limit);
  }

  async incrementUsage(userId: string, date: string) {
    const key = `${userId}:${date}`;
    const next = (data.usage.get(key) ?? 0) + 1;
    data.usage.set(key, next);
    return next;
  }
}
