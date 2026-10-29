import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { modelFor, modelLabel } from "@/lib/claude";
import { getUserContext } from "@/lib/context";
import { rateLimit } from "@/lib/guards";
import { UnauthorizedError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { currentUsage, withAiBudget } from "@/lib/budget";
import { parseCommand, runCommand, type LocalCommand } from "@/lib/commands";
import { HISTORY_LIMIT, compactHistory } from "@/lib/context-window";
import { interruptInstruction, interruptLabel, parseInterrupt } from "@/lib/interrupt";
import { PLANS, allowedMode } from "@/lib/plans";
import { RecordingCalendar } from "@/lib/ops";
import { OverBudgetError, TimeUpError } from "@/lib/pricing";
import { safeTimeZone } from "@/lib/time";

export const maxDuration = 60;


const interruptSettings = z.object({ start: z.enum(["now", "after_current"]), mode: z.enum(["slide", "trim"]) });

const body = z.object({
  message: z.string().trim().min(1).max(1000),
  tz: z.string().optional(),
  /** 割り込みモード（オンのときだけ送られる） */
  interrupt: interruptSettings.optional(),
  /** 割り込みの開始・後ろの予定の選び方（「割り込み30分」などで使う。割り込みモードがオフでも送られる） */
  interruptPrefs: interruptSettings.optional(),
  /** 節約（save：アプリで処理できる依頼は AI を使わない）／通常（normal：すべて AI）／強化（boost：Sonnet）／最大（max：Opus） */
  aiMode: z.enum(["save", "normal", "boost", "max"]).default("save"),
  /** 画面のデザイン。stoic なら返事をコーチの口調（敬語なし・厳しめ）にする */
  tone: z.enum(["soft", "stoic"]).default("soft"),
});

// POST /api/chat { message, tz, interrupt?, interruptPrefs?, aiMode? } → 予定を操作し、返答と Undo 用の opId を返す
export async function POST(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "メッセージを入力してください" }, { status: 400 });
    const tz = safeTimeZone(parsed.data.tz);
    const now = new Date();

    const { userId, calendar, store, plan, accountTz } = await getUserContext();
    // AI を使わずにアプリで処理する依頼も、カレンダーと履歴に書き込むので、短い時間に送れる回数を決める
    await rateLimit(store, userId, "chat");
    const recording = new RecordingCalendar(calendar);
    const { message, interrupt, tone } = parsed.data;
    // プランに無いモード（無料で強化・最大など）は、使えるいちばん上のモードに下げる（画面だけに頼らない）
    const aiMode = allowedMode(plan, parsed.data.aiMode);
    // 履歴には、割り込みモードで送ったことが分かる形で残す（AI にも伝わる）
    const userText = interrupt ? interruptLabel(message) : message;

    // 節約モード：アプリで読める依頼は AI を使わずに処理する（使用量は消費しない）。
    // 割り込みモードのときは、長さが読めれば割り込みとして扱う
    let command: LocalCommand | null = null;
    if (aiMode === "save") {
      const i = interrupt ? parseInterrupt(message) : null;
      command = interrupt ? (i && { kind: "interrupt", ...i }) : parseCommand(message);
    }
    if (command) {
      const prefs = interrupt ?? parsed.data.interruptPrefs ?? { start: "now", mode: "slide" };
      const reply = await runCommand(command, recording, { tz, now, interrupt: prefs, tone });
      // アプリでは決められなかった（空き時間が見つからないなど）ときは、下の AI に任せる
      if (reply !== null) {
        const opId = recording.ops.length ? crypto.randomUUID() : null;
        if (opId) await store.recordOps(userId, opId, recording.ops);
        await store.addMessages(
          userId,
          [
            { role: "user", content: userText },
            { role: "assistant", content: reply },
          ],
          opId ?? undefined,
        );
        const usage = await currentUsage({ store, userId, tz: accountTz, now, plan });
        return NextResponse.json({ reply, opId, changes: summarize(recording.ops), usage, local: true, aiMode });
      }
    }

    // 直近5件はそのまま、その前の5件は短い要約にして渡す（費用を下げる）
    const history = compactHistory(await store.recentMessages(userId, HISTORY_LIMIT));
    // カスタム指示（AI を使うときだけ読む。表がまだ無い環境でもチャットは動くように）
    // 使えるプランのときだけ（無料では、前に保存した指示があっても渡さない）
    const instructions = PLANS[plan].customInstructions ? await store.getCustomInstructions(userId).catch(() => null) : null;
    const prompt = interrupt ? `${interruptInstruction(interrupt)}\n${message}` : message;
    // 節約・通常は Haiku（難しい依頼は Sonnet）、強化は Sonnet、最大は Opus
    const model = modelFor(aiMode, message);
    // Claude を使うので、必ず予算の確認と費用の記録をする（使い切っていたら 429 で AI は呼ばない）
    const { result, usage, costPercent } = await withAiBudget({ store, userId, tz: accountTz, now, plan }, async (meter) => {
      try {
        const { reply } = await runAgent({ message: prompt, history, calendar: recording, tz, now, meter, model, tone, instructions });
        return { reply, fatal: null };
      } catch (err) {
        // ログインし直し・予算の残りや時間が足りない（AI を呼ぶ前に断った）は、そのまま画面に伝える
        if (err instanceof UnauthorizedError || err instanceof OverBudgetError || err instanceof TimeUpError) return { reply: "", fatal: err };
        console.error(err);
        let reply = "AIの処理中にエラーが発生しました。";
        if (recording.ops.length) reply += "途中までの変更は［元に戻す］で取り消せます。";
        return { reply, fatal: null };
      }
    });
    const { reply, fatal } = result;
    // 途中で失敗しても、反映済みの変更は Undo できるように記録する
    const opId = recording.ops.length ? crypto.randomUUID() : null;
    if (opId) await store.recordOps(userId, opId, recording.ops);
    if (fatal) throw fatal;
    await store.addMessages(
      userId,
      [
        { role: "user", content: userText },
        { role: "assistant", content: reply },
      ],
      opId ?? undefined,
    );

    return NextResponse.json({ reply, opId, changes: summarize(recording.ops), usage, costPercent, model: modelLabel(model), aiMode });
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
