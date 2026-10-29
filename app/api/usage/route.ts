import { NextResponse } from "next/server";
import { currentUsage } from "@/lib/budget";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";

// GET /api/usage → 今日・今月の AI の残り（予算に対する％）と、今のプラン
export async function GET() {
  try {
    // 使用量の日付は、アカウントのタイムゾーンで数える（画面から送られる tz は使わない）
    const { userId, store, plan, accountTz } = await getUserContext();
    return NextResponse.json(await currentUsage({ store, userId, tz: accountTz, plan }));
  } catch (err) {
    return errorResponse(err);
  }
}
