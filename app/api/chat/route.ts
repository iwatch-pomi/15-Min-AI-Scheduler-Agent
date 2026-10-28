import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { getUserContext } from "@/lib/context";
import { UnauthorizedError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { percentOfBudget, usageOf } from "@/lib/limits";
import { CostMeter } from "@/lib/pricing";
import { RecordingCalendar } from "@/lib/ops";
import { localDateString, safeTimeZone } from "@/lib/time";

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
    const date = localDateString(now, tz);
    // 1日の予算（費用）を使い切っていたら AI を呼ばない。1回の依頼は途中で止めないので、最後の1回は少し超えることがある
    const spent = await store.getCost(userId, date);
    if (usageOf(spent).exhausted) {
      return NextResponse.json({ error: "今日のAIの利用上限に達しました。明日の0時にもとに戻ります", usage: usageOf(spent) }, { status: 429 });
    }
    await store.incrementUsage(userId, date);
    const meter = new CostMeter();

    const recording = new RecordingCalendar(calendar);
    const history = await store.recentMessages(userId, HISTORY_LIMIT);
    let reply: string;
    let authError: UnauthorizedError | null = null;
    try {
      ({ reply } = await runAgent({ message: parsed.data.message, history, calendar: recording, tz, now, meter }));
    } catch (err) {
      if (err instanceof UnauthorizedError) authError = err;
      else console.error(err);
      reply = "AIの処理中にエラーが発生しました。";
      if (recording.ops.length) reply += "途中までの変更は［元に戻す］で取り消せます。";
    }
    // 途中で失敗しても、反映済みの変更は Undo できるように記録する
    const opId = recording.ops.length ? crypto.randomUUID() : null;
    if (opId) await store.recordOps(userId, opId, recording.ops);
    // かかった費用を記録する（失敗した依頼でも、AI を呼んだ分は数える）
    const total = await store.addCost(userId, date, meter.usd).catch((err) => {
      console.error("AI の費用を記録できませんでした（schema.sql の更新が必要かもしれません）", err);
      return spent + meter.usd;
    });
    if (authError) throw authError;
    await store.addMessages(
      userId,
      [
        { role: "user", content: parsed.data.message },
        { role: "assistant", content: reply },
      ],
      opId ?? undefined,
    );

    return NextResponse.json({ reply, opId, changes: summarize(recording.ops), usage: usageOf(total), costPercent: percentOfBudget(meter.usd) });
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
