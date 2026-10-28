import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SuggestError, generateSuggestions } from "@/lib/ai-suggest";
import { withAiBudget } from "@/lib/budget";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { dayRange, localDateString, safeTimeZone } from "@/lib/time";

export const maxDuration = 60;

const body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tz: z.string().optional(),
  /** 画面のデザイン。ストイックならコーチの口調で出す */
  tone: z.enum(["soft", "stoic"]).optional(),
});

// POST /api/suggestions { date, tz, tone? } → その日の「AIのおすすめ」を Claude で作る（AI の使用量を消費する）
export async function POST(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "日付が不正です" }, { status: 400 });
    const tz = safeTimeZone(parsed.data.tz);
    const now = new Date();
    const { date } = parsed.data;
    const { userId, calendar, store } = await getUserContext();
    const { start, end } = dayRange(date, tz);
    const events = (await calendar.list(start, end)).filter((b) => !b.allDay || b.start.slice(0, 10) === date);

    const { result, usage, costPercent } = await withAiBudget({ store, userId, tz, now }, (meter) =>
      generateSuggestions(meter, { date, tz, now, today: localDateString(now, tz), events, tone: parsed.data.tone }).catch((err) => {
        if (err instanceof SuggestError) return err;
        throw err;
      }),
    );
    if (result instanceof SuggestError) return NextResponse.json({ error: result.message, usage, costPercent }, { status: 502 });
    return NextResponse.json({ suggestions: result, usage, costPercent });
  } catch (err) {
    return errorResponse(err);
  }
}
