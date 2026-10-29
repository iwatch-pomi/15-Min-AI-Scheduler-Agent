import { NextResponse, type NextRequest } from "next/server";
import { BillingNotConfiguredError, handleWebhook } from "@/lib/billing";

// POST /api/billing/webhook ← Stripe からの知らせ（申し込み・プランの変更・解約）。
// Stripe のサーバーから直接届くので、proxy.ts の送り元の確認から外し、代わりに署名で確かめる
export async function POST(req: NextRequest) {
  // 署名は、受け取ったままの本文で確かめる（JSON にしてから戻すと、署名が合わなくなる）
  const raw = await req.text();
  try {
    await handleWebhook(raw, req.headers.get("stripe-signature"));
    return NextResponse.json({ received: true });
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    // 署名が違う・本文が壊れている
    if (err instanceof Error && err.name === "StripeSignatureVerificationError") {
      return NextResponse.json({ error: "署名を確かめられませんでした" }, { status: 400 });
    }
    // それ以外（データベースのエラーなど）は 500 にして、Stripe にもう一度送ってもらう
    console.error("Stripe の知らせを処理できませんでした", err);
    return NextResponse.json({ error: "処理できませんでした" }, { status: 500 });
  }
}
