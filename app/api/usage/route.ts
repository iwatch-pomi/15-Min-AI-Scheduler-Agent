import { NextResponse, type NextRequest } from "next/server";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { usageOf } from "@/lib/limits";
import { localDateString, safeTimeZone } from "@/lib/time";

// GET /api/usage?tz=… → 今日の AI の残り（予算に対する％）
export async function GET(req: NextRequest) {
  try {
    const tz = safeTimeZone(req.nextUrl.searchParams.get("tz"));
    const { userId, store } = await getUserContext();
    const used = await store.getCost(userId, localDateString(new Date(), tz));
    return NextResponse.json(usageOf(used));
  } catch (err) {
    return errorResponse(err);
  }
}
