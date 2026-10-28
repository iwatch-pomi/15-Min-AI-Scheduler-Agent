import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { routineInputSchema } from "@/lib/routines";
import { safeTimeZone } from "@/lib/time";

// 毎日のルーティン。AI は使わない（AI の利用量は減らない）

// GET /api/routines → 登録中のルーティン
export async function GET() {
  try {
    const { calendar } = await getUserContext();
    return NextResponse.json({ routines: await calendar.listRoutines() });
  } catch (err) {
    return errorResponse(err);
  }
}

const createBody = routineInputSchema.extend({ tz: z.string().optional() });
const updateBody = createBody.extend({ id: z.string().min(1) });
const deleteBody = z.object({ id: z.string().min(1), tz: z.string().optional() });

function invalid(error: z.ZodError) {
  return NextResponse.json({ error: error.issues[0]?.message ?? "入力が不正です" }, { status: 400 });
}

// POST /api/routines { title, time, minutes, days, tz } → 追加
export async function POST(req: NextRequest) {
  try {
    const parsed = createBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);
    const { tz, ...input } = parsed.data;
    const { calendar } = await getUserContext();
    return NextResponse.json({ routine: await calendar.createRoutine(input, safeTimeZone(tz)) });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/routines { id, title, time, minutes, days, tz } → 今日以降の分を変更（過去の分は残る）
export async function PATCH(req: NextRequest) {
  try {
    const parsed = updateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);
    const { id, tz, ...input } = parsed.data;
    const { calendar } = await getUserContext();
    return NextResponse.json({ routine: await calendar.updateRoutine(id, input, safeTimeZone(tz)) });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/routines { id, tz } → 今日以降の分をなくす（過去の分は残る）
export async function DELETE(req: NextRequest) {
  try {
    const parsed = deleteBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);
    const { calendar } = await getUserContext();
    await calendar.deleteRoutine(parsed.data.id, safeTimeZone(parsed.data.tz));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
