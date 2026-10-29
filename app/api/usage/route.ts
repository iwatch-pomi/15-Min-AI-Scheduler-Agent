import { NextResponse, type NextRequest } from "next/server";
import { currentUsage } from "@/lib/budget";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { safeTimeZone } from "@/lib/time";

// GET /api/usage?tz=… → 今日・今月の AI の残り（予算に対する％）と、今のプラン
export async function GET(req: NextRequest) {
  try {
    const tz = safeTimeZone(req.nextUrl.searchParams.get("tz"));
    const { userId, store, plan } = await getUserContext();
    return NextResponse.json(await currentUsage({ store, userId, tz, plan }));
  } catch (err) {
    return errorResponse(err);
  }
}
