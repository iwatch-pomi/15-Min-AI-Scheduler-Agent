import Anthropic from "@anthropic-ai/sdk";
import type { CostMeter } from "./pricing";

// Claude API を呼ぶ唯一の入り口。
// ルール：Claude を使ったら必ず使用量を記録する。そのため、ここ以外から SDK を呼ばない
// （tests/claude-gateway.test.ts で確認している）。費用は meter に足され、
// lib/budget.ts の withAiBudget が1日の予算に記録する。

/**
 * AI の使い方ごとのモデル（環境変数ではなく、ここで決める）。
 * 節約・通常は Haiku（難しい依頼だけ Sonnet）、強化は Sonnet、最大は Opus
 */
export const MODELS = { light: "claude-haiku-5-5", standard: "claude-sonnet-5-5", top: "claude-opus-5-5" } as const;
export const MODEL = MODELS.standard;

/** 依頼文を渡すと、節約・通常でも難しい依頼は Sonnet に回す */
export function modelFor(aiMode: "save" | "normal" | "boost" | "max" | undefined, message?: string): string {
  if (aiMode === "max") return MODELS.top;
  if (aiMode === "boost") return MODELS.standard;
  if (aiMode === "save" || aiMode === "normal") return message !== undefined && isHardRequest(message) ? MODELS.standard : MODELS.light;
  return MODELS.standard;
}

/** 画面に出すモデルの名前（Haiku・Sonnet・Opus） */
export function modelLabel(model: string): string {
  return model.includes("haiku") ? "Haiku" : model.includes("opus") ? "Opus" : model.includes("sonnet") ? "Sonnet" : model;
}

const HARD_WORDS =
  /分析|振り返|ふり返|浪費|無駄|ムダ|使い方|傾向|組み直|組みなお|組み立て|立て直|整理|見直|再調整|調整し|最適|優先|全部|すべて|全て|まとめて|計画|プラン|分解|分けて|振り分|割り振|週間|今週|来週|週末|毎日|リスケ|詰め|余裕|バランス/;

/**
 * 節約・通常モードで Sonnet に回す「難しい依頼」か（アプリで判定するので AI は使わない）。
 * たくさんの予定を動かす・組み立てる言葉、予定が2つ以上、長い文、を難しいとみなす
 */
export function isHardRequest(message: string): boolean {
  const s = message.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (HARD_WORDS.test(s)) return true;
  if (/そのあと|その後|それから|\n/.test(s)) return true;
  if ((s.match(/\d+\s*(?:分|時間)/g) ?? []).length >= 2) return true;
  return s.length > 60;
}

let client: Anthropic | null = null;

export type MessageParams = Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "model" | "betas" | "fallbacks"> & { model?: string };

/** Claude に1回問い合わせ、その費用を meter に足す */
export async function createMessage(meter: CostMeter, params: MessageParams): Promise<Anthropic.Beta.BetaMessage> {
  client ??= new Anthropic();
  // model: undefined が渡されても、決まったモデルを使う
  const model = params.model ?? MODEL;
  const response = await client.beta.messages.create({
    // 断られたとき、Anthropic 推奨の別モデルでやり直す（Haiku にはこの仕組みがないので付けない）
    ...(model.includes("haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    ...params,
    model,
  });
  meter.add(response.model ?? model, response.usage);
  return response;
}
