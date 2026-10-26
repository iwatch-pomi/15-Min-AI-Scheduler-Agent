import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { RecordingCalendar } from "@/lib/ops";
import { localDateString, safeTimeZone } from "@/lib/time";

export const maxDuration = 60;

const DAILY_LIMIT = Number(process.env.DAILY_CHAT_LIMIT ?? 50);
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
    const used = await store.incrementUsage(userId, localDateString(now, tz));
    if (used > DAILY_LIMIT) {
      return NextResponse.json({ error: `今日のAI利用回数の上限（${DAILY_LIMIT}回）に達しました` }, { status: 429 });
    }

    const recording = new RecordingCalendar(calendar);
    const history = await store.recentMessages(userId, HISTORY_LIMIT);
    let reply: string;
    try {
      ({ reply } = await runAgent({ message: parsed.data.message, history, calendar: recording, tz, now }));
    } catch (err) {
      console.error(err);
      reply = "AIの処理中にエラーが発生しました。";
      if (recording.ops.length) reply += "途中までの変更は［元に戻す］で取り消せます。";
    }
    // 途中で失敗しても、反映済みの変更は Undo できるように記録する
    const opId = recording.ops.length ? crypto.randomUUID() : null;
    if (opId) await store.recordOps(userId, opId, recording.ops);
    await store.addMessages(
      userId,
      [
        { role: "user", content: parsed.data.message },
        { role: "assistant", content: reply },
      ],
      opId ?? undefined,
    );

    return NextResponse.json({ reply, opId, changes: summarize(recording.ops) });
  } catch (err) {
    return errorResponse(err);
  }
}

function summarize(ops: RecordingCalendar["ops"]) {
  return {
    created: ops.filter((o) => o.kind === "create").length,
    updated: ops.filter((o) => o.kind === "update").length,
    deleted: ops.filter((o) => o.kind === "delete").length,
  };
}
