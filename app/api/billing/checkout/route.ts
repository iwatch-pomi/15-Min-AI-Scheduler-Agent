import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkoutUrl } from "@/lib/billing";
import { getUserContext, isDemo } from "@/lib/context";
import { billingError } from "@/lib/http";
import { PAID_PLANS } from "@/lib/plans";

const body = z.object({ plan: z.enum(PAID_PLANS) });

// POST /api/billing/checkout { plan } → Stripe の申し込み画面の URL（すでに契約していれば管理の画面の URL）
export async function POST(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "プランを選んでください" }, { status: 400 });
    if (isDemo()) return NextResponse.json({ error: "デモではお支払いは使えません" }, { status: 400 });
    const { userId } = await getUserContext();
    return NextResponse.json(await checkoutUrl({ userId, plan: parsed.data.plan, origin: req.nextUrl.origin }));
  } catch (err) {
    return billingError(err);
  }
}
