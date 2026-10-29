import { NextResponse, type NextRequest } from "next/server";
import { portalUrl } from "@/lib/billing";
import { getUserContext, isDemo } from "@/lib/context";
import { billingError } from "@/lib/http";

// POST /api/billing/portal → お支払い・解約・プランの変更の画面（Stripe）の URL
export async function POST(req: NextRequest) {
  try {
    if (isDemo()) return NextResponse.json({ error: "デモではお支払いは使えません" }, { status: 400 });
    const { userId } = await getUserContext();
    const url = await portalUrl({ userId, origin: req.nextUrl.origin });
    if (!url) return NextResponse.json({ error: "まだ有料プランを申し込んでいません" }, { status: 400 });
    return NextResponse.json({ url });
  } catch (err) {
    return billingError(err);
  }
}
