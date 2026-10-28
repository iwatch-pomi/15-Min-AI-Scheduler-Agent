import { NextResponse, type NextRequest } from "next/server";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { usageOf } from "@/lib/limits";
import { localDateString, safeTimeZone } from "@/lib/time";

// GET /api/usage?tz=… → 今日の AI 利用回数と残り回数
export async function GET(req: NextRequest) {
  try {
    const tz = safeTimeZone(req.nextUrl.searchParams.get("tz"));
    const { userId, store } = await getUserContext();
    const used = await store.getUsage(userId, localDateString(new Date(), tz));
    return NextResponse.json(usageOf(used));
  } catch (err) {
    return errorResponse(err);
  }
}
