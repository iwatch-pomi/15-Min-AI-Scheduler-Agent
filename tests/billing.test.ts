import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// 偽の Stripe：サブスクの一覧・顧客・申し込み画面・ポータル・署名の確認
const stripe = {
  subscriptions: { list: vi.fn() },
  customers: { create: vi.fn(), del: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
};
vi.mock("stripe", () => ({
  default: class {
    constructor() {
      return stripe;
    }
  },
}));

// 偽のユーザーの保存先（Supabase の users の代わり）
type Row = { plan: string; email: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; plan_status: string | null; plan_renews_at: string | null };
const users = new Map<string, Row>();
vi.mock("@/lib/users", () => ({
  getBilling: async (id: string) => {
    const r = users.get(id)!;
    return { plan: r.plan, email: r.email, stripeCustomerId: r.stripe_customer_id, stripeSubscriptionId: r.stripe_subscription_id, planStatus: r.plan_status, planRenewsAt: r.plan_renews_at };
  },
  saveStripeCustomerId: async (id: string, customerId: string) => {
    const r = users.get(id)!;
    r.stripe_customer_id ??= customerId;
    return r.stripe_customer_id;
  },
  applySubscription: async (customerId: string, sub: { plan: string; subscriptionId: string | null; status: string | null; renewsAt: string | null }) => {
    const r = [...users.values()].find((u) => u.stripe_customer_id === customerId);
    if (!r) return false;
    Object.assign(r, { plan: sub.plan, stripe_subscription_id: sub.subscriptionId, plan_status: sub.status, plan_renews_at: sub.renewsAt });
    return true;
  },
}));

let userId = "";
vi.mock("@/lib/context", () => ({
  getUserContext: async () => ({ userId, plan: users.get(userId)!.plan }),
  isDemo: () => false,
}));

process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
process.env.STRIPE_PRICE_PLUS = "price_plus";
process.env.STRIPE_PRICE_PRO = "price_pro";

const webhook = (await import("@/app/api/billing/webhook/route")).POST;
const checkout = (await import("@/app/api/billing/checkout/route")).POST;

const sub = (price: string, status = "active", extra: Record<string, unknown> = {}) => ({
  id: `sub_${price}_${status}`,
  status,
  cancel_at_period_end: false,
  items: { data: [{ price: { id: price }, current_period_end: Date.UTC(2026, 10, 29) / 1000 }] },
  ...extra,
});
const post = async (handler: (req: NextRequest) => Promise<Response>, url: string, body: string, headers: Record<string, string> = {}) => {
  const res = await handler(new NextRequest(url, { method: "POST", body, headers }));
  return { status: res.status, data: await res.json() };
};
const event = (type: string, object: Record<string, unknown>) => ({ type, data: { object } });

beforeEach(() => {
  vi.clearAllMocks();
  users.clear();
  userId = crypto.randomUUID();
  users.set(userId, { plan: "free", email: "a@example.com", stripe_customer_id: "cus_1", stripe_subscription_id: null, plan_status: null, plan_renews_at: null });
  stripe.subscriptions.list.mockResolvedValue({ data: [] });
});

describe("Stripe からの知らせ（webhook）", () => {
  it("署名が正しくなければ 400 にし、プランは変えない", async () => {
    stripe.webhooks.constructEvent.mockImplementation(() => {
      const err = new Error("bad signature");
      err.name = "StripeSignatureVerificationError";
      throw err;
    });
    const { status } = await post(webhook, "http://x/api/billing/webhook", "{}", { "stripe-signature": "t=1,v1=bad" });
    expect(status).toBe(400);
    expect(users.get(userId)!.plan).toBe("free");
  });

  it("受け取ったままの本文と署名で確かめる", async () => {
    stripe.webhooks.constructEvent.mockReturnValue(event("invoice.paid", {}));
    const raw = '{"id":"evt_1",  "type":"invoice.paid"}';
    const { status } = await post(webhook, "http://x/api/billing/webhook", raw, { "stripe-signature": "t=1,v1=ok" });
    expect(status).toBe(200);
    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(raw, "t=1,v1=ok", "whsec_x");
  });

  it("申し込みが済むと、Stripe の最新の状態を読み直してプランを変える", async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [sub("price_pro")] });
    stripe.webhooks.constructEvent.mockReturnValue(event("checkout.session.completed", { customer: "cus_1", client_reference_id: userId }));
    await post(webhook, "http://x/api/billing/webhook", "{}", { "stripe-signature": "s" });
    expect(users.get(userId)).toMatchObject({ plan: "pro", stripe_subscription_id: "sub_price_pro_active", plan_status: "active", plan_renews_at: "2026-11-29T00:00:00.000Z" });
  });

  it("解約の予約は canceling、期間が終わって消えたら無料に戻す", async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [sub("price_plus", "active", { cancel_at_period_end: true })] });
    stripe.webhooks.constructEvent.mockReturnValue(event("customer.subscription.updated", { customer: "cus_1" }));
    await post(webhook, "http://x/api/billing/webhook", "{}", { "stripe-signature": "s" });
    expect(users.get(userId)).toMatchObject({ plan: "plus", plan_status: "canceling" });

    stripe.subscriptions.list.mockResolvedValue({ data: [sub("price_plus", "canceled")] });
    stripe.webhooks.constructEvent.mockReturnValue(event("customer.subscription.deleted", { customer: "cus_1" }));
    await post(webhook, "http://x/api/billing/webhook", "{}", { "stripe-signature": "s" });
    expect(users.get(userId)).toMatchObject({ plan: "free", stripe_subscription_id: null, plan_status: null });
  });

  it("知らない価格のサブスクではプランを上げない", async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [sub("price_other")] });
    stripe.webhooks.constructEvent.mockReturnValue(event("customer.subscription.created", { customer: "cus_1" }));
    await post(webhook, "http://x/api/billing/webhook", "{}", { "stripe-signature": "s" });
    expect(users.get(userId)!.plan).toBe("free");
  });
});

describe("申し込みの画面（Checkout）", () => {
  it("顧客がいなければ作り、ユーザーの ID を付けて申し込みの画面を作る", async () => {
    users.get(userId)!.stripe_customer_id = null;
    stripe.customers.create.mockResolvedValue({ id: "cus_new" });
    stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/x" });
    const { status, data } = await post(checkout, "https://app.example/api/billing/checkout", JSON.stringify({ plan: "plus" }));
    expect(status).toBe(200);
    expect(data).toEqual({ url: "https://checkout.stripe.com/c/pay/x", portal: false });
    expect(stripe.customers.create).toHaveBeenCalledWith({ email: "a@example.com", metadata: { userId } });
    expect(stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      mode: "subscription",
      customer: "cus_new",
      client_reference_id: userId,
      line_items: [{ price: "price_plus", quantity: 1 }],
      success_url: "https://app.example/?billing=success",
      cancel_url: "https://app.example/?billing=cancel",
    });
  });

  it("すでに契約していたら、二重に契約しないよう管理の画面（ポータル）を返す", async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [sub("price_plus")] });
    stripe.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.com/p/x" });
    const { data } = await post(checkout, "https://app.example/api/billing/checkout", JSON.stringify({ plan: "pro" }));
    expect(data).toEqual({ url: "https://billing.stripe.com/p/x", portal: true });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("プランの指定が正しくなければ 400、Stripe の設定がなければ 503", async () => {
    expect((await post(checkout, "https://app.example/api/billing/checkout", JSON.stringify({ plan: "free" }))).status).toBe(400);
    const price = process.env.STRIPE_PRICE_PRO;
    delete process.env.STRIPE_PRICE_PRO;
    try {
      const { status, data } = await post(checkout, "https://app.example/api/billing/checkout", JSON.stringify({ plan: "pro" }));
      expect(status).toBe(503);
      expect(data.error).toBe("お支払いはまだ準備中です");
    } finally {
      process.env.STRIPE_PRICE_PRO = price;
    }
  });
});
