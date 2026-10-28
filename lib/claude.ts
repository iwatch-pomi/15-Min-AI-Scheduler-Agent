import Anthropic from "@anthropic-ai/sdk";
import type { CostMeter } from "./pricing";

// Claude API を呼ぶ唯一の入り口。
// ルール：Claude を使ったら必ず使用量を記録する。そのため、ここ以外から SDK を呼ばない
// （tests/claude-gateway.test.ts で確認している）。費用は meter に足され、
// lib/budget.ts の withAiBudget が1日の予算に記録する。

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;

export type MessageParams = Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "model" | "betas" | "fallbacks"> & { model?: string };

/** Claude に1回問い合わせ、その費用を meter に足す */
export async function createMessage(meter: CostMeter, params: MessageParams): Promise<Anthropic.Beta.BetaMessage> {
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    // 断られたとき、Anthropic 推奨の別モデルでやり直す
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...params,
  });
  meter.add(response.model ?? params.model ?? MODEL, response.usage);
  return response;
}
