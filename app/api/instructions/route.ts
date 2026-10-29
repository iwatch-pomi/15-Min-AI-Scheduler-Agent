import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/context";
import { MAX_INSTRUCTIONS_LENGTH, normalizeInstructions } from "@/lib/custom-instructions";
import { errorResponse } from "@/lib/http";
import { PLANS, firstPlanWith } from "@/lib/plans";

// AI へのカスタム指示（毎回 AI に渡す文）。端末間で共有する。ここでは AI は使わない

/** カスタム指示が使えないプランのときの文 */
const notAllowed = () => `カスタム指示は有料プラン（${PLANS[firstPlanWith((r) => r.customInstructions)].label}から）で使えます`;

// GET /api/instructions → { text, allowed }（指示なしは null。allowed は今のプランで使えるか）
export async function GET() {
  try {
    const { userId, store, plan } = await getUserContext();
    const text = await store.getCustomInstructions(userId).catch((err) => {
      // schema.sql が古い（列がない）ときも、画面は動くようにする
      console.error("カスタム指示を読めませんでした", err);
      return null;
    });
    return NextResponse.json({ text, allowed: PLANS[plan].customInstructions });
  } catch (err) {
    return errorResponse(err);
  }
}

const body = z.object({ text: z.string().max(MAX_INSTRUCTIONS_LENGTH * 2).nullable() });

// PUT /api/instructions { text } → 保存した指示（空なら消す）
export async function PUT(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "指示の内容が不正です" }, { status: 400 });
    const text = normalizeInstructions(parsed.data.text);
    const { userId, store, plan } = await getUserContext();
    // 消すことはいつでもできる。書くのは使えるプランだけ
    if (text !== null && !PLANS[plan].customInstructions) return NextResponse.json({ error: notAllowed() }, { status: 403 });
    await store.saveCustomInstructions(userId, text);
    return NextResponse.json({ text });
  } catch (err) {
    return errorResponse(err);
  }
}
