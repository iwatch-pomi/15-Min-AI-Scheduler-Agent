import Anthropic from "@anthropic-ai/sdk";
import { MIN_CALL_MS, TimeUpError, estimateInputTokens, fitMaxTokens, responseCostUsd, worstCaseUsd, type CostMeter } from "./pricing";

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

/**
 * Claude に1回問い合わせ、その費用を meter に足す。
 * 送る前に、この1回の最悪の費用（入力＋返事を max_tokens まで書いた場合）が、この依頼で使える額（meter の残り）に入るよう、
 * 返事の長さの上限を下げる。短い返事も入らないときは、AI を呼ばずに OverBudgetError
 */
export async function createMessage(meter: CostMeter, params: MessageParams): Promise<Anthropic.Beta.BetaMessage> {
  client ??= new Anthropic();
  // model: undefined が渡されても、決まったモデルを使う
  const model = params.model ?? MODEL;
  const inputTokens = estimateInputTokens({ system: params.system, tools: params.tools, messages: params.messages });
  // 断られたとき、Anthropic 推奨の別モデルでやり直す（Haiku にはこの仕組みがないので付けない）
  const fallback = !model.includes("haiku");
  // やり直すと、断った1回と、代わりのモデルの1回の両方に費用がかかる。両方が残りに入るよう、1回分を残りの半分までにする
  const maxTokens = fitMaxTokens(model, inputTokens, params.max_tokens, fallback ? meter.leftUsd / 2 : meter.leftUsd);
  const request = {
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    ...params,
    max_tokens: maxTokens,
    model,
  };
  for (let attempt = 0; ; attempt++) {
    // サーバーの実行時間の上限の前に返事を待ち終える（打ち切られると、費用を記録できない）
    const leftMs = meter.leftMs;
    if (leftMs < MIN_CALL_MS) throw new TimeUpError();
    try {
      // SDK の自動のやり直しは使わない（待ち時間が上限を超え、やり直した分の費用も分からなくなる）
      const response = await client.beta.messages.create(request, { timeout: Number.isFinite(leftMs) ? leftMs - 2000 : undefined, maxRetries: 0 });
      // 断って別のモデルでやり直した分も、それぞれのモデルの料金で数える
      await meter.charge(responseCostUsd(model, response));
      return response;
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      if (typeof status !== "number") {
        // 返事を待つ途中で打ち切った・通信が切れた。Anthropic の側では作り終えて費用がかかっていることがあるので、最悪の費用で数える
        await meter.charge(worstCaseUsd(model, inputTokens, maxTokens));
        throw err;
      }
      // 混み合っている（429・529）・一時的なエラーは、時間があれば1回だけやり直す（エラーの返事には費用がかからない）
      if (attempt === 0 && [429, 500, 502, 503, 529].includes(status) && meter.leftMs > MIN_CALL_MS + 1000) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      throw err;
    }
  }
}
