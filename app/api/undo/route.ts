import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { undoOps } from "@/lib/ops";

const body = z.object({ opId: z.uuid() });

// POST /api/undo { opId } → そのチャットで行った変更をまとめて取り消す
export async function POST(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "opId が不正です" }, { status: 400 });
    const { userId, calendar, store } = await getUserContext();
    const ops = await store.getOps(userId, parsed.data.opId);
    if (!ops.length) return NextResponse.json({ error: "取り消せる変更がありません" }, { status: 404 });
    // 二重に取り消さないよう、先に印を付けてから戻す
    await store.markUndone(userId, parsed.data.opId);
    const undone = await undoOps(calendar, ops);
    return NextResponse.json({ undone });
  } catch (err) {
    return errorResponse(err);
  }
}
