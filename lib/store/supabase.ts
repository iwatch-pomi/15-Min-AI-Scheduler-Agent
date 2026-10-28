import { db } from "../db";
import type { ChatMessage, Operation } from "../types";
import type { Theme } from "../theme";
import type { OpGroup, SavedBrief, Store, StoredMessage } from "./types";

export class SupabaseStore implements Store {
  async recordOps(userId: string, groupId: string, ops: Operation[]) {
    if (!ops.length) return;
    // 同じグループに続けて記録するとき（結果カードでの手動編集）は、順番を続きから振る
    const { data: last, error: lastError } = await db()
      .from("operations")
      .select("seq")
      .eq("user_id", userId)
      .eq("op_group_id", groupId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;
    const offset = last ? (last.seq as number) + 1 : 0;
    const rows = ops.map((op, i) => ({
      user_id: userId,
      op_group_id: groupId,
      seq: offset + i,
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

  async addCost(userId: string, date: string, usd: number) {
    const { data, error } = await db().rpc("add_usage_cost", {
      p_user_id: userId,
      p_date: date,
      p_cost: Math.ceil(usd * 1_000_000),
    });
    if (error) throw error;
    return Number(data) / 1_000_000;
  }

  async getCost(userId: string, date: string) {
    // "*" で読むのは、schema.sql の更新（cost_microusd 列の追加）前でも動くようにするため
    const { data, error } = await db().from("usage").select("*").eq("user_id", userId).eq("date", date).maybeSingle();
    if (error) throw error;
    return Number(data?.cost_microusd ?? 0) / 1_000_000;
  }

  async listMessages(userId: string, opts: { before?: string; limit: number }) {
    let query = db()
      .from("messages")
      .select("id, role, content, op_group_id, created_at")
      .eq("user_id", userId)
      .order("id", { ascending: false })
      .limit(opts.limit + 1);
    if (opts.before) query = query.lt("id", Number(opts.before));
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const messages: StoredMessage[] = rows
      .slice(0, opts.limit)
      .reverse()
      .map((r) => ({ id: String(r.id), role: r.role, content: r.content, opGroupId: r.op_group_id, createdAt: r.created_at }));
    return { messages, hasMore: rows.length > opts.limit };
  }

  async getOpGroups(userId: string, groupIds: string[]) {
    const out = new Map<string, OpGroup>();
    if (!groupIds.length) return out;
    const { data, error } = await db()
      .from("operations")
      .select("op_group_id, kind, google_event_id, before, after, undone")
      .eq("user_id", userId)
      .in("op_group_id", groupIds)
      .order("seq");
    if (error) throw error;
    for (const r of data ?? []) {
      const group = out.get(r.op_group_id) ?? { ops: [], undone: true };
      group.ops.push({ kind: r.kind, blockId: r.google_event_id, before: r.before, after: r.after });
      group.undone = group.undone && r.undone;
      out.set(r.op_group_id, group);
    }
    return out;
  }

  async deleteMessages(userId: string) {
    const { error } = await db().from("messages").delete().eq("user_id", userId);
    if (error) throw error;
  }

  async saveBrief(userId: string, brief: SavedBrief, keepFrom: string) {
    const { error } = await db().from("briefs").upsert(
      {
        user_id: userId,
        date: brief.date,
        tone: brief.tone,
        items: brief.items,
        cost_percent: brief.costPercent,
        created_at: brief.createdAt,
      },
      { onConflict: "user_id,date,tone" },
    );
    if (error) throw error;
    // 古い日付のものは残しておいても使わないので消す
    const { error: deleteError } = await db().from("briefs").delete().eq("user_id", userId).lt("date", keepFrom);
    if (deleteError) throw deleteError;
  }

  async getBrief(userId: string, date: string, tone: Theme) {
    const { data, error } = await db()
      .from("briefs")
      .select("date, tone, items, cost_percent, created_at")
      .eq("user_id", userId)
      .eq("date", date)
      .eq("tone", tone)
      .maybeSingle();
    if (error) throw error;
    return data ? { date: data.date, tone: data.tone, items: data.items, costPercent: Number(data.cost_percent), createdAt: data.created_at } : null;
  }

  async getQuickActions(userId: string) {
    const { data, error } = await db().from("user_settings").select("quick_actions").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return Array.isArray(data?.quick_actions) ? (data.quick_actions as string[]) : null;
  }

  async saveQuickActions(userId: string, actions: string[]) {
    const { error } = await db()
      .from("user_settings")
      .upsert({ user_id: userId, quick_actions: actions, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
  }
}
