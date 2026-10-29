import { NextResponse } from "next/server";
import { pricesConfigured } from "@/lib/billing";
import { getUserContext, isDemo } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { getBilling } from "@/lib/users";

/** Stripe の設定（環境変数）がそろっているか */
const configured = () => Boolean(process.env.STRIPE_SECRET_KEY) && pricesConfigured();

// GET /api/billing → 今のプランと、契約の状態（次の更新日など）。マイページのプランの節で使う
export async function GET() {
  try {
    const { userId, plan } = await getUserContext();
    if (isDemo()) return NextResponse.json({ plan, status: null, renewsAt: null, customer: false, available: false });
    const billing = await getBilling(userId);
    return NextResponse.json({
      plan,
      status: billing.planStatus,
      renewsAt: billing.planRenewsAt,
      customer: Boolean(billing.stripeCustomerId),
      available: configured(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
