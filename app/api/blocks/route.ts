import { NextResponse, type NextRequest } from "next/server";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { ManualEditError, applyManualChanges, manualChangesSchema } from "@/lib/manual";
import { RecordingCalendar } from "@/lib/ops";

// POST /api/blocks { changes } → 結果カードでの手動編集を反映し、Undo 用の opId を返す
export async function POST(req: NextRequest) {
  try {
    const parsed = manualChangesSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "入力が不正です" }, { status: 400 });
    }
    const { userId, calendar, store } = await getUserContext();
    const recording = new RecordingCalendar(calendar);

    let items;
    let failure: unknown = null;
    try {
      items = await applyManualChanges(recording, parsed.data.changes);
    } catch (err) {
      failure = err;
    }
    // 途中で失敗しても、反映済みの分は Undo できるように記録する
    const opId = recording.ops.length ? crypto.randomUUID() : null;
    if (opId) await store.recordOps(userId, opId, recording.ops);

    if (failure instanceof ManualEditError) {
      return NextResponse.json({ error: failure.message, opId }, { status: 400 });
    }
    if (failure) throw failure;
    return NextResponse.json({ opId, items });
  } catch (err) {
    return errorResponse(err);
  }
}
