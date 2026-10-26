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

export async function getRefreshToken(userId: string): Promise<string | null> {
  const { data, error } = await db().from("users").select("refresh_token_enc").eq("id", userId).single();
  if (error) throw error;
  return data?.refresh_token_enc ? decrypt(data.refresh_token_enc) : null;
}
