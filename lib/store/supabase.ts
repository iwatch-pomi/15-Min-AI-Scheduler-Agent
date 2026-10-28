import { db } from "../db";
import type { ChatMessage, Operation } from "../types";
import type { Store } from "./types";

export class SupabaseStore implements Store {
  async recordOps(userId: string, groupId: string, ops: Operation[]) {
    if (!ops.length) return;
    const rows = ops.map((op, i) => ({
      user_id: userId,
      op_group_id: groupId,
      seq: i,
      kind: op.kind,
      google_event_id: op.blockId,
      before: op.before,
      after: op.after,
    }));
    const { error } = await db().from("operations").insert(rows);
    if (error) throw error;
  }

  async getOps(userId: string, groupId: string) {
    const { data, error } = await db()
      .from("operations")
      .select("kind, google_event_id, before, after")
      .eq("user_id", userId)
      .eq("op_group_id", groupId)
      .eq("undone", false)
      .order("seq");
    if (error) throw error;
    return (data ?? []).map(
      (r): Operation => ({ kind: r.kind, blockId: r.google_event_id, before: r.before, after: r.after }),
    );
  }

  async markUndone(userId: string, groupId: string) {
    const { error } = await db()
      .from("operations")
      .update({ undone: true })
      .eq("user_id", userId)
      .eq("op_group_id", groupId);
    if (error) throw error;
  }

  async addMessages(userId: string, messages: ChatMessage[], groupId?: string) {
    const rows = messages.map((m) => ({ user_id: userId, role: m.role, content: m.content, op_group_id: groupId ?? null }));
    const { error } = await db().from("messages").insert(rows);
    if (error) throw error;
  }

  async recentMessages(userId: string, limit: number) {
    const { data, error } = await db()
      .from("messages")
      .select("role, content")
      .eq("user_id", userId)
      .order("id", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as ChatMessage[]).reverse();
  }

  async incrementUsage(userId: string, date: string) {
    const { data, error } = await db().rpc("increment_usage", { p_user_id: userId, p_date: date });
    if (error) throw error;
    return data as number;
  }

  async getUsage(userId: string, date: string) {
    const { data, error } = await db().from("usage").select("llm_calls").eq("user_id", userId).eq("date", date).maybeSingle();
    if (error) throw error;
    return (data?.llm_calls as number | undefined) ?? 0;
  }
}
