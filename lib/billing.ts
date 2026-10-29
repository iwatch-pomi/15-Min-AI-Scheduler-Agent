import Stripe from "stripe";
import { BillingNotConfiguredError } from "./errors";
import { PAID_PLANS, PLAN_IDS, type PaidPlan, type Plan } from "./plans";
import { applySubscription, getBilling, saveStripeCustomerId } from "./users";

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
  const customer = await customerFor(opts.userId);
  if (await hasAliveSubscription(customer)) return { url: await portalUrlFor(customer, opts.origin), portal: true };
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
  return stripeCustomerId ? portalUrlFor(stripeCustomerId, opts.origin) : null;
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
