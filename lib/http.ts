import { NextResponse } from "next/server";
import { UnauthorizedError } from "./context";

/** ルートハンドラ共通のエラー処理 */
export function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  console.error(err);
  return NextResponse.json({ error: "サーバーでエラーが発生しました" }, { status: 500 });
}
