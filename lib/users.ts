import { decrypt, encrypt } from "./crypto";
import { db } from "./db";

/**
 * Google ログイン時に呼ぶ。ユーザーを作成・更新し、内部の user id を返す。
 * Google はリフレッシュトークンを初回同意時にしか返さないことがあるので、
 * 来なかったときは既存の値を残す。
 */
export async function upsertGoogleUser(input: {
  googleSub: string;
  email: string | null | undefined;
  refreshToken: string | null | undefined;
}): Promise<string> {
  const row: Record<string, unknown> = { google_sub: input.googleSub, email: input.email ?? null };
  if (input.refreshToken) row.refresh_token_enc = encrypt(input.refreshToken);
  const { data, error } = await db()
    .from("users")
    .upsert(row, { onConflict: "google_sub" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function getGoogleAccount(
  userId: string,
): Promise<{ refreshToken: string | null; aiCalendarId: string | null; timezone: string }> {
  // "*" で読むのは、schema.sql の更新（ai_calendar_id 列の追加）前でも予定の表示は動くようにするため
  const { data, error } = await db().from("users").select("*").eq("id", userId).single();
  if (error) throw error;
  return {
    refreshToken: data?.refresh_token_enc ? decrypt(data.refresh_token_enc) : null,
    aiCalendarId: data?.ai_calendar_id ?? null,
    timezone: data?.timezone ?? "Asia/Tokyo",
  };
}

/** AI 専用カレンダーの id を保存する。すでに別の id が保存されていたらそちらを返す（同時作成の対策） */
export async function saveAiCalendarId(userId: string, id: string): Promise<string> {
  const { data, error } = await db()
    .from("users")
    .update({ ai_calendar_id: id })
    .eq("id", userId)
    .is("ai_calendar_id", null)
    .select("ai_calendar_id");
  if (error) throw error;
  if (data?.length) return id;
  const { data: row, error: readError } = await db().from("users").select("ai_calendar_id").eq("id", userId).single();
  if (readError) throw readError;
  return (row?.ai_calendar_id as string | null) ?? id;
}

/** ユーザーが Google 側で専用カレンダーを消していたときに、保存した id を消す */
export async function clearAiCalendarId(userId: string, id: string): Promise<void> {
  const { error } = await db().from("users").update({ ai_calendar_id: null }).eq("id", userId).eq("ai_calendar_id", id);
  if (error) throw error;
}
