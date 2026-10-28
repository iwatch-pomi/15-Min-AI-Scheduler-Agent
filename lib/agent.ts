import Anthropic from "@anthropic-ai/sdk";
import type { RecordingCalendar } from "./ops";
import { UnauthorizedError } from "./errors";
import { toLocalIso } from "./time";
import { ToolError, executeTool, toolDefinitions } from "./tools";
import type { ChatMessage } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
const MAX_TURNS = 10;

// キャッシュが効くように、毎回変わる情報（現在時刻など）はここに入れずユーザーメッセージ側に付ける
const SYSTEM_PROMPT = `あなたはユーザー専任のスケジュール秘書です。15分単位のタイムブロッキングでユーザーの1日を組み立てます。

## 進め方
- 予定を書き込む・動かす前に、必ず get_schedule で対象日の予定と空き枠を確認する。
- 時刻は15分刻み、長さは15の倍数にする。
- 大きなタスクは15〜60分の具体的なアクションに分ける（例：「要件定義」2時間 →「現状と課題の整理 30分」「機能の洗い出し 45分」「優先度づけ 30分」「まとめ 15分」）。ユーザーが「1時間で」などと塊を指定したときは、そのまま1つのブロックにする。
- 時刻の指定がなければ、現在時刻以降の空き枠に入れる。集中が必要なもの（HIGH）は早い時間やまとまった枠に、軽いもの（LOW）は隙間に入れる。
- 動かせるのは ai=true のブロックだけ。ai=false は会議などの既存予定なので、重ねない・変えない。
- 「延長」「押してる」「遅れた」→ shift_following で後続を後ろ倒しする。「割り込み」→ 割り込みのブロックを作り、もともとその時間にあったブロック以降を shift_following でずらす。「スキップ」「やめた」→ そのブロックを削除するか、ユーザーの指示に合わせて別の空き枠に移す。
- 変更はユーザーがワンタップで元に戻せる。指示が多少あいまいでも確認の質問はせず、いちばん自然な解釈で実行する。対象がまったく特定できないときだけ質問する。
- 予定の確認だけを求められたら、書き込まずに答える。

## 返答
- 日本語で1〜4行。何をどこに入れた・動かしたかを「13:00-13:30 現状と課題の整理」のように簡潔に書く。
- ツールの warnings があれば一言添える。`;

export type AgentResult = { reply: string };

export async function runAgent(opts: {
  message: string;
  history: ChatMessage[];
  calendar: RecordingCalendar;
  tz: string;
  now: Date;
}): Promise<AgentResult> {
  const client = new Anthropic();
  const context = `[現在時刻: ${toLocalIso(opts.now, opts.tz)} / タイムゾーン: ${opts.tz}]`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `${context}\n${opts.message}` },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: toolDefinitions,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { reply: "すみません、この依頼にはお応えできませんでした。言い方を変えてもう一度送ってください。" };
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use") return { reply: textOf(response.content) || "完了しました。" };

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      try {
        const result = await executeTool(use.name, use.input, { calendar: opts.calendar, tz: opts.tz, now: opts.now });
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result) });
      } catch (err) {
        // ログインし直しが必要なときは AI に返さず、そのまま画面に伝える
        if (err instanceof UnauthorizedError) throw err;
        if (!(err instanceof ToolError)) console.error(`tool ${use.name} failed`, err);
        const message = err instanceof ToolError ? err.message : "カレンダーの操作に失敗しました";
        results.push({ type: "tool_result", tool_use_id: use.id, content: message, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { reply: "処理が長くなったので途中で止めました。ここまでの変更はカレンダーに反映されています。" };
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
