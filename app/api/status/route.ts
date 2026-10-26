import { NextResponse, type NextRequest } from "next/server";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { addMinutes, localTime, minutesBetween, safeTimeZone } from "@/lib/time";

// GET /api/status → 今やるブロックと残り時間、次のブロック（ウィジェット・通知用）
export async function GET(req: NextRequest) {
  try {
    const tz = safeTimeZone(req.nextUrl.searchParams.get("tz"));
    const now = new Date();
    const { calendar } = await getUserContext();
    const blocks = (await calendar.list(now, addMinutes(now, 24 * 60))).filter((b) => !b.allDay);
    const current = blocks.find((b) => new Date(b.start) <= now && new Date(b.end) > now) ?? null;
    const next = blocks.find((b) => new Date(b.start) > now) ?? null;
    const brief = (b: (typeof blocks)[number]) => ({
      id: b.id,
      title: b.title,
      start: localTime(new Date(b.start), tz),
      end: localTime(new Date(b.end), tz),
      ai: b.ai,
    });
    return NextResponse.json({
      now: now.toISOString(),
      current: current && { ...brief(current), remainingMinutes: minutesBetween(now, new Date(current.end)) },
      next: next && { ...brief(next), startsInMinutes: minutesBetween(now, new Date(next.start)) },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
