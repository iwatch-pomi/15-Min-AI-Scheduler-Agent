import { z } from "zod";
import { createMessage } from "./claude";
import type { CostMeter } from "./pricing";
import { freeSlots } from "./slots";
import type { Suggestion } from "./suggest";
import type { Block } from "./types";
import { localTime, minutesBetween, zonedToUtc } from "./time";
import { formatDateJa } from "./ui";

// 「AIのおすすめ」を Claude に考えてもらう。費用を抑えるため、予定を短い文章にまとめて渡し、effort は low

const SYSTEM = `あなたはユーザー専任のスケジュール秘書です。1日の予定を見て、ユーザーの役に立つ「おすすめ」を最大3つ出します。

- 空き時間の使い方、休憩、準備・移動の余裕、詰め込みすぎ、ルーティンとのバランスなど、その日の予定に合った具体的な提案にする
- text は1〜2文・60字以内。やさしく前向きな口調で、時刻や予定名を入れて具体的に
- prompt は、ユーザーがスケジュールAIにそのまま送れる依頼文（例：「16:30から60分、レポートの続きを入れて」）。続きをユーザーが書く形なら「〜で、」で終えてよい
- icon は calendar（予定・空き時間）、bulb（準備・アイデア）、leaf（休憩・体調・気分転換）から選ぶ
- メインのカレンダーの予定は動かせないので、それを動かす提案はしない`;

const schema = z.object({
  suggestions: z
    .array(
      z.object({
        icon: z.enum(["calendar", "bulb", "leaf"]),
        text: z.string().min(1).max(120),
        prompt: z.string().min(1).max(200),
      }),
    )
    .max(5),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["icon", "text", "prompt"],
        properties: {
          icon: { type: "string", enum: ["calendar", "bulb", "leaf"] },
          text: { type: "string" },
          prompt: { type: "string" },
        },
      },
    },
  },
};

export class SuggestError extends Error {}

/** その日の予定を、AI に渡す短い文章にする */
export function describeDay(opts: { date: string; tz: string; now: Date; today: string; events: Block[] }): string {
  const { date, tz, now, today, events } = opts;
  const t = (iso: string) => localTime(new Date(iso), tz);
  const timed = events.filter((e) => !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
  const kind = (e: Block) => (e.routine ? "ルーティン" : e.ai ? "AIが入れた予定" : "メイン（動かせない）");
  const lines = timed.map((e) => `- ${t(e.start)}-${t(e.end)} ${e.title}（${kind(e)}${e.location ? `・${e.location}` : ""}）`);
  const allDay = events.filter((e) => e.allDay).map((e) => `- 終日 ${e.title}`);

  let from = zonedToUtc(date, 8, 0, tz);
  if (date === today && now > from) from = now;
  const to = zonedToUtc(date, 22, 0, tz);
  const free = from < to ? freeSlots(timed, from, to, 30) : [];
  const freeText = free.map((s) => `${localTime(s.start, tz)}-${localTime(s.end, tz)}（${minutesBetween(s.start, s.end)}分）`).join("、");

  return [
    `日付：${formatDateJa(date)}${date === today ? `（今日・現在 ${localTime(now, tz)}）` : ""}`,
    "予定：",
    ...(lines.length || allDay.length ? [...allDay, ...lines] : ["- なし"]),
    `空き時間（8:00〜22:00、30分以上）：${freeText || "なし"}`,
  ].join("\n");
}

export async function generateSuggestions(
  meter: CostMeter,
  opts: { date: string; tz: string; now: Date; today: string; events: Block[] },
): Promise<Suggestion[]> {
  const response = await createMessage(meter, {
    max_tokens: 2000,
    output_config: { effort: "low", format: { type: "json_schema", schema: jsonSchema } },
    system: SYSTEM,
    messages: [{ role: "user", content: describeDay(opts) }],
  });
  if (response.stop_reason === "refusal") throw new SuggestError("おすすめを作れませんでした。時間をおいてもう一度お試しください");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(text));
  } catch {
    throw new SuggestError("おすすめをうまく読み取れませんでした。もう一度お試しください");
  }
  return parsed.suggestions.slice(0, 3).map((s, i) => ({ id: `ai-${i}`, ...s }));
}

