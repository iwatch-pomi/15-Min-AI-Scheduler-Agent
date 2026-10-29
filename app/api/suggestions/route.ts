import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SuggestError, generateSuggestions } from "@/lib/ai-suggest";
import { withAiBudget } from "@/lib/budget";
import { MODELS } from "@/lib/claude";
import { BRIEF_LEVELS, PLANS, firstPlanWith, type Plan } from "@/lib/plans";
import type { Store } from "@/lib/store/types";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { addDays, dayRange, localDateString, safeTimeZone } from "@/lib/time";

/** 保存しておく AI のおすすめは、今日の7日前の分まで */
const KEEP_DAYS = 7;

/** 今日あと何回「AIで更新」を使えるか。null は回数の上限なし（有料プラン） */
async function briefsLeft(store: Store, userId: string, plan: Plan, today: string): Promise<number | null> {
  const limit = PLANS[plan].briefsPerDay;
  if (limit === null) return null;
  const used = await store.getBriefCount(userId, today).catch(() => 0);
  return Math.max(0, limit - used);
}

// GET /api/suggestions?date=YYYY-MM-DD&tone=soft|stoic&tz=… → 保存してある AI のおすすめと、今日あと何回更新できるか（AI は使わない）
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date") ?? "";
    const tone = req.nextUrl.searchParams.get("tone") === "stoic" ? "stoic" : "soft";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "日付が不正です" }, { status: 400 });
    const tz = safeTimeZone(req.nextUrl.searchParams.get("tz"));
    const { userId, store, plan } = await getUserContext();
    const left = await briefsLeft(store, userId, plan, localDateString(new Date(), tz));
    const brief = await store.getBrief(userId, date, tone).catch((err) => {
      // schema.sql が古い（briefs テーブルがない）ときも、画面はふつうに動くようにする
      console.error("AI のおすすめを読めませんでした", err);
      return null;
    });
    return NextResponse.json({ brief: brief && { items: brief.items, costPercent: brief.costPercent, at: brief.createdAt }, briefsLeft: left });
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
// AI の使い方（モード）に関係なく、プランで決まる AI で作る（無料・ライトは簡易版の Haiku で1日1回、スタンダードから詳しい版の Sonnet。PLANS の brief・briefsPerDay）
export async function POST(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "日付が不正です" }, { status: 400 });
    const tz = safeTimeZone(parsed.data.tz);
    const now = new Date();
    const { date } = parsed.data;
    const { userId, calendar, store, plan } = await getUserContext();
    const { start, end } = dayRange(date, tz);
    const events = (await calendar.list(start, end)).filter((b) => !b.allDay || b.start.slice(0, 10) === date);

    const today = localDateString(now, tz);
    // 回数の上限があるプラン（無料・ライト）は、AI を呼ぶ前に1回分を数える（1回の足し算なので、同時に押されても2回は通らない）
    const limit = PLANS[plan].briefsPerDay;
    // 使えないプラン（briefsPerDay が 0）は、数えずに断る
    if (limit === 0) {
      const from = firstPlanWith((r) => r.briefsPerDay !== 0);
      return NextResponse.json(
        { error: `${PLANS[plan].label}プランでは「AIで更新」は使えません（${PLANS[from].label}から1日${PLANS[from].briefsPerDay}回使えます）`, briefsLeft: 0 },
        { status: 429 },
      );
    }
    let used = 0;
    if (limit !== null) {
      used = await store.addBriefCount(userId, today, 1);
      if (used > limit) {
        await store.addBriefCount(userId, today, -1).catch(() => {});
        return NextResponse.json(
          { error: `${PLANS[plan].label}プランの「AIで更新」は1日${limit}回までです。明日の0時にまた使えます（${PLANS[firstPlanWith((r) => r.briefsPerDay === null)].label}からは回数の制限がなく、より詳しい版になります）`, briefsLeft: 0 },
          { status: 429 },
        );
      }
    }
    // AI のおすすめを作れなかったときは、数えた1回分を戻す（もう一度押せるように）
    const refund = () => (limit !== null ? store.addBriefCount(userId, today, -1).catch(() => 0) : Promise.resolve(0));
    const left = limit === null ? null : Math.max(0, limit - used);

    // カスタム指示は、使えるプランのときだけ渡す（前に保存した指示があっても）
    const instructions = PLANS[plan].customInstructions ? await store.getCustomInstructions(userId).catch(() => null) : null;
    const { result, usage, costPercent } = await withAiBudget({ store, userId, tz, now, plan }, (meter) =>
      generateSuggestions(meter, { date, tz, now, today, events, tone: parsed.data.tone, model: MODELS[BRIEF_LEVELS[PLANS[plan].brief].model], instructions }).catch((err) => {
        if (err instanceof SuggestError) return err;
        throw err;
      }),
    ).catch(async (err) => {
      await refund();
      throw err;
    });
    if (result instanceof SuggestError) {
      await refund();
      return NextResponse.json({ error: result.message, usage, costPercent, briefsLeft: left === null ? null : left + 1 }, { status: 502 });
    }
    // Web を閉じても・ほかの端末でも見られるように保存する（同じ日付・口調のものは新しいものに置き換える）
    const at = now.toISOString();
    await store
      .saveBrief(userId, { date, tone: parsed.data.tone ?? "soft", items: result, costPercent, createdAt: at }, addDays(today, -KEEP_DAYS))
      .catch((err) => console.error("AI のおすすめを保存できませんでした（schema.sql の更新が必要かもしれません）", err));
    return NextResponse.json({ suggestions: result, usage, costPercent, at, briefsLeft: left });
  } catch (err) {
    return errorResponse(err);
  }
}
