import Stripe from "stripe";
import { BillingNotConfiguredError } from "./errors";
import { PAID_PLANS, PLAN_IDS, type PaidPlan, type Plan } from "./plans";
import { applySubscription, clearStripeCustomerId, getBilling, saveStripeCustomerId } from "./users";

export { BillingNotConfiguredError };

// 有料プランの支払い（Stripe）。カードの情報は Stripe の画面だけで扱い、このアプリには届かない。
// プランは Stripe から届く知らせ（webhook）で、そのたびに Stripe の最新の状態を読み直して決める

let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new BillingNotConfiguredError();
  client ??= new Stripe(key);
  return client;
}

/** プランの価格 ID（Stripe の管理画面で作り、環境変数に入れる） */
const PRICE_ENV: Record<PaidPlan, string> = {
  plus: "STRIPE_PRICE_PLUS",
  standard: "STRIPE_PRICE_STANDARD",
  pro: "STRIPE_PRICE_PRO",
};

export function priceFor(plan: PaidPlan): string {
  const id = process.env[PRICE_ENV[plan]];
  if (!id) throw new BillingNotConfiguredError();
  return id;
}

/** 有料プランの価格 ID がすべてそろっているか */
export function pricesConfigured(): boolean {
  return PAID_PLANS.every((p) => Boolean(process.env[PRICE_ENV[p]]));
}

export function planForPrice(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  return PAID_PLANS.find((p) => process.env[PRICE_ENV[p]] === priceId) ?? null;
}

/** 使える状態のサブスク（支払いが遅れている間も、すぐには止めない） */
const ALIVE = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

/**
 * 顧客のサブスクを Stripe から読み直し、いちばん上のプランをユーザーに書く。
 * 知らせの順番が前後しても、最後は Stripe と同じ状態になる。
 * 書いたプランを返す（顧客に結び付いたユーザーがいなければ null）
 */
export async function syncCustomer(customerId: string): Promise<Plan | null> {
  const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  let best: { plan: Plan; sub: Stripe.Subscription } | null = null;
  for (const sub of subs.data) {
    if (!ALIVE.has(sub.status)) continue;
    const plan = planForPrice(sub.items.data[0]?.price.id);
    if (plan && (!best || PLAN_IDS.indexOf(plan) > PLAN_IDS.indexOf(best.plan))) best = { plan, sub };
  }
  const renews = best?.sub.items.data[0]?.current_period_end;
  const ok = await applySubscription(customerId, {
    plan: best?.plan ?? "free",
    subscriptionId: best?.sub.id ?? null,
    status: best ? (best.sub.cancel_at_period_end ? "canceling" : best.sub.status) : null,
    renewsAt: renews ? new Date(renews * 1000).toISOString() : null,
  });
  return ok ? (best?.plan ?? "free") : null;
}

/** ユーザーの Stripe の顧客。まだ無ければ作って結び付ける（同時に作られても、最初の1つを使う） */
async function customerFor(userId: string): Promise<string> {
  const billing = await getBilling(userId);
  if (billing.stripeCustomerId) return billing.stripeCustomerId;
  const email = billing.email;
  const customer = await stripe().customers.create({ ...(email ? { email } : {}), metadata: { userId } });
  const saved = await saveStripeCustomerId(userId, customer.id);
  // 別の依頼が先に結び付けていたら、いま作った顧客は使わない
  if (saved !== customer.id) await stripe().customers.del(customer.id).catch(() => {});
  return saved;
}

/** その顧客に、使える状態のサブスクがあるか */
async function hasAliveSubscription(customerId: string): Promise<boolean> {
  const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  return subs.data.some((s) => ALIVE.has(s.status));
}

/**
 * 申し込みの画面（Stripe Checkout）の URL。
 * すでに有料プランを契約していたら、二重に契約しないよう、管理の画面（ポータル）の URL を返す
 */
export async function checkoutUrl(opts: { userId: string; plan: PaidPlan; origin: string }): Promise<{ url: string; portal: boolean }> {
  const price = priceFor(opts.plan);
  let customer = await customerFor(opts.userId);
  let alive: boolean;
  try {
    alive = await hasAliveSubscription(customer);
  } catch (err) {
    // 保存していた顧客が Stripe に無い（テスト環境で作った顧客のまま本番のキーにしたときなど）。外して作り直す
    if (!isMissingCustomer(err)) throw err;
    await clearStripeCustomerId(opts.userId, customer);
    customer = await customerFor(opts.userId);
    alive = await hasAliveSubscription(customer);
  }
  if (alive) return { url: await portalUrlFor(customer, opts.origin), portal: true };
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: opts.userId,
    line_items: [{ price, quantity: 1 }],
    metadata: { userId: opts.userId, plan: opts.plan },
    subscription_data: { metadata: { userId: opts.userId } },
    locale: "ja",
    success_url: `${opts.origin}/?billing=success`,
    cancel_url: `${opts.origin}/?billing=cancel`,
  });
  if (!session.url) throw new Error("Stripe の申し込み画面を作れませんでした");
  return { url: session.url, portal: false };
}

async function portalUrlFor(customer: string, origin: string): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${origin}/?billing=portal` });
  return session.url;
}

/** お支払い・解約・プランの変更の画面（Stripe のカスタマーポータル）の URL。まだ顧客でなければ null */
export async function portalUrl(opts: { userId: string; origin: string }): Promise<string | null> {
  const { stripeCustomerId } = await getBilling(opts.userId);
  if (!stripeCustomerId) return null;
  try {
    return await portalUrlFor(stripeCustomerId, opts.origin);
  } catch (err) {
    // Stripe に無い顧客は外す（まだ申し込んでいないのと同じ扱い）
    if (!isMissingCustomer(err)) throw err;
    await clearStripeCustomerId(opts.userId, stripeCustomerId);
    return null;
  }
}

/** Stripe のエラー（型を import せずに読む） */
type StripeErrorLike = { type?: string; code?: string; param?: string; message?: string };

/** 「その顧客は無い」というエラーか */
function isMissingCustomer(err: unknown): boolean {
  const e = err as StripeErrorLike | null;
  return e?.code === "resource_missing" && (e.param === "customer" || /No such customer/i.test(e.message ?? ""));
}

/**
 * お支払いの画面を開けなかった理由を、運営者が直せる言葉にする（設定の間違いがほとんどのため）。
 * Stripe のキーや ID の値そのものは出さない
 */
export function billingFailureReason(err: unknown): string {
  const e = (err ?? {}) as StripeErrorLike;
  const msg = e.message ?? "";
  if (e.type === "StripeAuthenticationError") return "Stripe のシークレットキー（STRIPE_SECRET_KEY）が正しくありません。sk_test_ か sk_live_ で始まるキーを入れてください";
  if (e.type === "StripePermissionError") return "Stripe のキーに権限がありません。制限付きのキーなら、顧客・サブスク・Checkout・カスタマーポータルの書き込み権限を付けてください";
  if (/No such price/i.test(msg)) {
    return /prod_/.test(msg)
      ? "価格 ID の欄に商品 ID（prod_…）が入っています。STRIPE_PRICE_… には price_ で始まる価格 ID を入れてください"
      : "価格 ID が見つかりません。STRIPE_PRICE_… の値と、テスト環境・本番のどちらのキーかが合っているか確かめてください";
  }
  if (/price/i.test(msg) && /inactive|archived/i.test(msg)) return "価格がアーカイブ（無効）になっています。STRIPE_PRICE_… に、今使っている価格の ID を入れてください";
  if (/recurring/i.test(msg)) return "価格が「継続（毎月）」になっていません。Stripe で、継続・毎月の価格を作り直してください";
  if (/business name|account name/i.test(msg)) return "Stripe の設定で、公開用のビジネス名（アカウント名）を入れてください";
  if (/configuration/i.test(msg) && /portal/i.test(msg)) return "カスタマーポータルの設定がまだです。Stripe の 設定 → Billing → カスタマーポータル で保存してください";
  // Supabase：schema.sql を実行していない（列が無い）
  const pg = err as { code?: string } | null;
  if (pg?.code === "42703" || /stripe_customer_id|plan_status|plan_renews_at/.test(msg)) return "データベースの更新が必要です。Supabase で supabase/schema.sql をもう一度実行してください";
  // それ以外は、Stripe の文をそのまま添える（キーなどの秘密の値は伏せる）
  if (e.type?.startsWith("Stripe")) return `Stripe でエラーが起きました（${e.code ?? e.type}）：${maskSecrets(msg).slice(0, 300)}`;
  return "少し待ってからもう一度お試しください";
}

/** Stripe からの知らせ（webhook）を処理する。署名が正しくなければ投げる */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<{ type: string; plan: Plan | null }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new BillingNotConfiguredError();
  const event = stripe().webhooks.constructEvent(rawBody, signature ?? "", secret);
  const customerOf = (c: string | { id: string } | null) => (typeof c === "string" ? c : (c?.id ?? null));

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const customer = customerOf(session.customer);
      const userId = session.client_reference_id ?? session.metadata?.userId;
      if (!customer) return { type: event.type, plan: null };
      // 申し込みの前に結び付けているが、念のためここでも結び付ける
      if (userId) await saveStripeCustomerId(userId, customer);
      return { type: event.type, plan: await syncCustomer(customer) };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const customer = customerOf(event.data.object.customer);
      return { type: event.type, plan: customer ? await syncCustomer(customer) : null };
    }
    default:
      return { type: event.type, plan: null };
  }
}

/** エラーの文に入っていることがある秘密の値（シークレットキー・署名シークレット）を伏せる */
function maskSecrets(text: string): string {
  return text.replace(/\b(sk|rk|whsec)_[A-Za-z0-9_*]+/g, "$1_****");
}
