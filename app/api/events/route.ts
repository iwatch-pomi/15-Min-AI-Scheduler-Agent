import { NextResponse, type NextRequest } from "next/server";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { dayRange, localDateString, safeTimeZone } from "@/lib/time";

// GET /api/events?date=YYYY-MM-DD&tz=Asia/Tokyo → その日の予定
export async function GET(req: NextRequest) {
  try {
    const tz = safeTimeZone(req.nextUrl.searchParams.get("tz"));
    const dateParam = req.nextUrl.searchParams.get("date");
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : localDateString(new Date(), tz);
    const { calendar } = await getUserContext();
    const { start, end } = dayRange(date, tz);
    const blocks = await calendar.list(start, end);
    // 終日予定は「その日の日付」のものだけ残す
    const events = blocks.filter((b) => !b.allDay || b.start.slice(0, 10) === date);
    return NextResponse.json({ date, events });
  } catch (err) {
    return errorResponse(err);
  }
}
