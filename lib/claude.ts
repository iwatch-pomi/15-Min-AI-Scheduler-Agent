import Anthropic from "@anthropic-ai/sdk";
import type { CostMeter } from "./pricing";

// Claude API を呼ぶ唯一の入り口。
// ルール：Claude を使ったら必ず使用量を記録する。そのため、ここ以外から SDK を呼ばない
// （tests/claude-gateway.test.ts で確認している）。費用は meter に足され、
// lib/budget.ts の withAiBudget が1日の予算に記録する。

/** AI の使い方ごとのモデル。節約・通常は Sonnet、強化は Opus（環境変数ではなく、ここで決める） */
export const MODELS = { standard: "claude-sonnet-5-5", boost: "claude-opus-5-5" } as const;
export const MODEL = MODELS.standard;

export function modelFor(aiMode: "save" | "normal" | "boost" | undefined): string {
  return aiMode === "boost" ? MODELS.boost : MODELS.standard;
}

let client: Anthropic | null = null;

export type MessageParams = Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "model" | "betas" | "fallbacks"> & { model?: string };

/** Claude に1回問い合わせ、その費用を meter に足す */
export async function createMessage(meter: CostMeter, params: MessageParams): Promise<Anthropic.Beta.BetaMessage> {
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    // 断られたとき、Anthropic 推奨の別モデルでやり直す
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...params,
    // model: undefined が渡されても、決まったモデルを使う
    model: params.model ?? MODEL,
  });
  meter.add(response.model ?? params.model ?? MODEL, response.usage);
  return response;
}
