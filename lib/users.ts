import { decrypt, encrypt } from "./crypto";
import { db } from "./db";
import { toPlan, type Plan } from "./plans";

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
): Promise<{ refreshToken: string | null; aiCalendarId: string | null; timezone: string; plan: Plan }> {
  // "*" で読むのは、schema.sql の更新（ai_calendar_id 列の追加）前でも予定の表示は動くようにするため
  const { data, error } = await db().from("users").select("*").eq("id", userId).single();
  if (error) throw error;
  return {
    refreshToken: data?.refresh_token_enc ? decrypt(data.refresh_token_enc) : null,
    aiCalendarId: data?.ai_calendar_id ?? null,
    timezone: data?.timezone ?? "Asia/Tokyo",
    // plan 列がまだ無い（schema.sql の更新前）ときは無料
    plan: toPlan(data?.plan),
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

/** 支払い（Stripe）まわりの情報 */
export type Billing = {
  plan: Plan;
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planStatus: string | null;
  planRenewsAt: string | null;
};

export async function getBilling(userId: string): Promise<Billing> {
  const { data, error } = await db().from("users").select("*").eq("id", userId).single();
  if (error) throw error;
  return {
    plan: toPlan(data?.plan),
    email: data?.email ?? null,
    stripeCustomerId: data?.stripe_customer_id ?? null,
    stripeSubscriptionId: data?.stripe_subscription_id ?? null,
    planStatus: data?.plan_status ?? null,
    planRenewsAt: data?.plan_renews_at ?? null,
  };
}

/** Stripe の顧客 ID を結び付ける。すでに別の ID が結び付いていたらそちらを返す（同時に申し込んだときの対策） */
export async function saveStripeCustomerId(userId: string, customerId: string): Promise<string> {
  const { data, error } = await db()
    .from("users")
    .update({ stripe_customer_id: customerId })
    .eq("id", userId)
    .is("stripe_customer_id", null)
    .select("stripe_customer_id");
  if (error) throw error;
  if (data?.length) return customerId;
  const { data: row, error: readError } = await db().from("users").select("stripe_customer_id").eq("id", userId).single();
  if (readError) throw readError;
  return (row?.stripe_customer_id as string | null) ?? customerId;
}

/** Stripe に見つからなくなった顧客 ID を外す（テスト環境と本番を切り替えたときなど）。次の申し込みで作り直す */
export async function clearStripeCustomerId(userId: string, customerId: string): Promise<void> {
  const { error } = await db().from("users").update({ stripe_customer_id: null }).eq("id", userId).eq("stripe_customer_id", customerId);
  if (error) throw error;
}

/** Stripe のサブスクの状態を、顧客 ID のユーザーに書く（webhook から呼ぶ）。書いたユーザーが無ければ false */
export async function applySubscription(
  customerId: string,
  sub: { plan: Plan; subscriptionId: string | null; status: string | null; renewsAt: string | null },
): Promise<boolean> {
  const { data, error } = await db()
    .from("users")
    .update({ plan: sub.plan, stripe_subscription_id: sub.subscriptionId, plan_status: sub.status, plan_renews_at: sub.renewsAt })
    .eq("stripe_customer_id", customerId)
    .select("id");
  if (error) throw error;
  return Boolean(data?.length);
}
