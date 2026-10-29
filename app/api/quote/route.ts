import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withAiBudget } from "@/lib/budget";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { QuoteError, generateQuote } from "@/lib/quote";

const body = z.object({
  slot: z.enum(["morning", "day", "evening", "night"]),
  tz: z.string().optional(),
  arc: z.object({ name: z.string().max(30), day: z.number().int().min(1).max(10000), total: z.number().int().min(1).max(10000) }).nullish(),
  recent: z.array(z.string().max(60)).max(5).optional(),
});

export const maxDuration = 60;

// POST /api/quote { slot, tz, arc?, recent? } → ストイックのホームに出す、時間帯のひと言（名言）を AI で作る（使用量を消費する）
export async function POST(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
    // 使用量の日付は、アカウントのタイムゾーンで数える（画面から送られる tz は使わない）
    const { userId, store, plan, accountTz } = await getUserContext();
    const { result, usage, costPercent } = await withAiBudget({ store, userId, tz: accountTz, plan }, (meter) =>
      generateQuote(meter, parsed.data).catch((err) => {
        if (err instanceof QuoteError) return err;
        throw err;
      }),
    );
    if (result instanceof QuoteError) return NextResponse.json({ error: result.message, usage, costPercent }, { status: 502 });
    return NextResponse.json({ quote: result, usage, costPercent });
  } catch (err) {
    return errorResponse(err);
  }
}
