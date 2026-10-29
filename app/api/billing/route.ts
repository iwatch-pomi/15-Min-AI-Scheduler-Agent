import { NextResponse } from "next/server";
import { pendingChange, pricesConfigured } from "@/lib/billing";
import { getUserContext, isDemo } from "@/lib/context";
import { rateLimit } from "@/lib/guards";
import { errorResponse } from "@/lib/http";
import { getBilling } from "@/lib/users";

/** Stripe の設定（環境変数）がそろっているか */
const configured = () => Boolean(process.env.STRIPE_SECRET_KEY) && pricesConfigured();

// GET /api/billing → 今のプランと、契約の状態（次の更新日・期間の終わりに予定されているプランの変更など）。マイページのプランの節で使う
export async function GET() {
  try {
    const { userId, plan, store } = await getUserContext();
    await rateLimit(store, userId, "billing");
    if (isDemo()) return NextResponse.json({ plan, status: null, renewsAt: null, next: null, customer: false, available: false });
    const billing = await getBilling(userId);
    // 安いプランへの切り替えの予約（読めなくても、ほかの表示は出す）
    const next =
      billing.stripeSubscriptionId && configured()
        ? await pendingChange(billing.stripeSubscriptionId).catch((err) => {
            console.error("予定されているプランの変更を読めませんでした", err);
            return null;
          })
        : null;
    return NextResponse.json({
      plan,
      status: billing.planStatus,
      renewsAt: billing.planRenewsAt,
      next,
      customer: Boolean(billing.stripeCustomerId),
      available: configured(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
