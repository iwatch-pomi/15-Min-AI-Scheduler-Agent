import { NextResponse } from "next/server";
import { BudgetExceededError } from "./budget";
import { BillingNotConfiguredError, UnauthorizedError } from "./errors";

/** ルートハンドラ共通のエラー処理 */
export function errorResponse(err: unknown) {
  if (err instanceof BudgetExceededError) {
    return NextResponse.json({ error: err.message, usage: err.usage }, { status: 429 });
  }
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  console.error(err);
  return NextResponse.json({ error: "サーバーでエラーが発生しました" }, { status: 500 });
}

/** お支払いの API のエラー処理。Stripe のエラーの中身（内部の情報）は画面に出さない */
export function billingError(err: unknown) {
  if (err instanceof BillingNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
  if (err instanceof UnauthorizedError) return errorResponse(err);
  console.error("お支払いの処理に失敗しました", err);
  return NextResponse.json({ error: "お支払いの画面を開けませんでした。少し待ってからもう一度お試しください" }, { status: 502 });
}
