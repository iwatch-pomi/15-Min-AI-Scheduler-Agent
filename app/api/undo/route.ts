import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { undoOps } from "@/lib/ops";

// opIds は古い順（AI の変更 → そのあとの手動編集）。1つだけなら opId でもよい
const body = z.union([
  z.object({ opIds: z.array(z.uuid()).min(1).max(20) }),
  z.object({ opId: z.uuid() }).transform((b) => ({ opIds: [b.opId] })),
]);

// POST /api/undo { opIds } → そのチャットと、その後の手動編集の変更をまとめて取り消す
export async function POST(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "opId が不正です" }, { status: 400 });
    const { opIds } = parsed.data;
    const { userId, calendar, store } = await getUserContext();

    // 全グループの操作を古い順に並べて一度に戻す。削除の取り消しで id が変わっても、
    // それより前のグループの操作が新しい id を追えるようにするため
    const groups = await Promise.all(opIds.map((id) => store.getOps(userId, id)));
    const ops = groups.flat();
    if (!ops.length) return NextResponse.json({ error: "取り消せる変更がありません" }, { status: 404 });
    // 二重に取り消さないよう、先に印を付けてから戻す
    await Promise.all(opIds.map((id) => store.markUndone(userId, id)));
    const undone = await undoOps(calendar, ops);
    return NextResponse.json({ undone });
  } catch (err) {
    return errorResponse(err);
  }
}
