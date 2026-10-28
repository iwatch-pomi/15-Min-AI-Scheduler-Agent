import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { getUserContext } from "@/lib/context";
import { UnauthorizedError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { withAiBudget } from "@/lib/budget";
import { RecordingCalendar } from "@/lib/ops";
import { safeTimeZone } from "@/lib/time";

export const maxDuration = 60;

const HISTORY_LIMIT = 10;

const body = z.object({ message: z.string().trim().min(1).max(1000), tz: z.string().optional() });

// POST /api/chat { message, tz } → AI が予定を操作し、返答と Undo 用の opId を返す
export async function POST(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "メッセージを入力してください" }, { status: 400 });
    const tz = safeTimeZone(parsed.data.tz);
    const now = new Date();

    const { userId, calendar, store } = await getUserContext();
    const recording = new RecordingCalendar(calendar);
    const history = await store.recentMessages(userId, HISTORY_LIMIT);
    // Claude を使うので、必ず予算の確認と費用の記録をする（使い切っていたら 429 で AI は呼ばない）
    const { result, usage, costPercent } = await withAiBudget({ store, userId, tz, now }, async (meter) => {
      try {
        const { reply } = await runAgent({ message: parsed.data.message, history, calendar: recording, tz, now, meter });
        return { reply, authError: null };
      } catch (err) {
        if (err instanceof UnauthorizedError) return { reply: "", authError: err };
        console.error(err);
        let reply = "AIの処理中にエラーが発生しました。";
        if (recording.ops.length) reply += "途中までの変更は［元に戻す］で取り消せます。";
        return { reply, authError: null };
      }
    });
    const { reply, authError } = result;
    // 途中で失敗しても、反映済みの変更は Undo できるように記録する
    const opId = recording.ops.length ? crypto.randomUUID() : null;
    if (opId) await store.recordOps(userId, opId, recording.ops);
    if (authError) throw authError;
    await store.addMessages(
      userId,
      [
        { role: "user", content: parsed.data.message },
        { role: "assistant", content: reply },
      ],
      opId ?? undefined,
    );

    return NextResponse.json({ reply, opId, changes: summarize(recording.ops), usage, costPercent });
  } catch (err) {
    return errorResponse(err);
  }
}

function summarize(ops: RecordingCalendar["ops"]) {
  return {
    created: ops.filter((o) => o.kind === "create").length,
    updated: ops.filter((o) => o.kind === "update").length,
    deleted: ops.filter((o) => o.kind === "delete").length,
    // 画面の結果カード用。作成・変更は変更後、削除は削除前の予定を返す
    items: ops.flatMap((o) => {
      const b = o.kind === "delete" ? o.before : o.after;
      return b ? [{ id: b.id, kind: o.kind, title: b.title, start: b.start, end: b.end, energy: b.energy }] : [];
    }),
  };
}
