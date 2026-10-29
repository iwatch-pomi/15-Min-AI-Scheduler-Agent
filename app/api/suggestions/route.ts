import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SuggestError, generateSuggestions } from "@/lib/ai-suggest";
import { withAiBudget } from "@/lib/budget";
import { MODELS } from "@/lib/claude";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { addDays, dayRange, localDateString, safeTimeZone } from "@/lib/time";

/** 保存しておく AI のおすすめは、今日の7日前の分まで */
const KEEP_DAYS = 7;

// GET /api/suggestions?date=YYYY-MM-DD&tone=soft|stoic → 保存してある AI のおすすめ（AI は使わない）
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date") ?? "";
    const tone = req.nextUrl.searchParams.get("tone") === "stoic" ? "stoic" : "soft";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "日付が不正です" }, { status: 400 });
    const { userId, store } = await getUserContext();
    const brief = await store.getBrief(userId, date, tone).catch((err) => {
      // schema.sql が古い（briefs テーブルがない）ときも、画面はふつうに動くようにする
      console.error("AI のおすすめを読めませんでした", err);
      return null;
    });
    return NextResponse.json({ brief: brief && { items: brief.items, costPercent: brief.costPercent, at: brief.createdAt } });
  } catch (err) {
    return errorResponse(err);
  }
}

export const maxDuration = 60;

const body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tz: z.string().optional(),
  /** 画面のデザイン。ストイックならコーチの口調で出す */
  tone: z.enum(["soft", "stoic"]).optional(),
});

// POST /api/suggestions { date, tz, tone? } → その日の「AIのおすすめ」を Claude で作り、保存する（AI の使用量を消費する）。
// AI の使い方（モード）に関係なく、いつも Sonnet で作る
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

    const instructions = await store.getCustomInstructions(userId).catch(() => null);
    const { result, usage, costPercent } = await withAiBudget({ store, userId, tz, now }, (meter) =>
      generateSuggestions(meter, { date, tz, now, today: localDateString(now, tz), events, tone: parsed.data.tone, model: MODELS.standard, instructions }).catch((err) => {
        if (err instanceof SuggestError) return err;
        throw err;
      }),
    );
    if (result instanceof SuggestError) return NextResponse.json({ error: result.message, usage, costPercent }, { status: 502 });
    // Web を閉じても・ほかの端末でも見られるように保存する（同じ日付・口調のものは新しいものに置き換える）
    const at = now.toISOString();
    const today = localDateString(now, tz);
    await store
      .saveBrief(userId, { date, tone: parsed.data.tone ?? "soft", items: result, costPercent, createdAt: at }, addDays(today, -KEEP_DAYS))
      .catch((err) => console.error("AI のおすすめを保存できませんでした（schema.sql の更新が必要かもしれません）", err));
    return NextResponse.json({ suggestions: result, usage, costPercent, at });
  } catch (err) {
    return errorResponse(err);
  }
}
