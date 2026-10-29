// Claude API の料金（米ドル / 100万トークン）。2026-10 時点の公式料金。料金が変わったらここを直す
// cacheWrite は 5分キャッシュの書き込み（入力の1.25倍）、cacheRead はキャッシュの読み込み
type Price = { input: number; output: number; cacheRead: number };

const PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
// 表にないモデル（新しいモデルや、断られたときの代わりのモデル）は、高めに見積もる
const UNKNOWN: Price = { input: 10, output: 50, cacheRead: 1 };

export type TokenUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

function priceOf(model: string): Price {
  return PRICES[model] ?? PRICES[model.replace(/-\d{8}$/, "")] ?? UNKNOWN;
}

/** 1回の API 呼び出しの費用（米ドル） */
export function costUsd(model: string, usage: TokenUsage | null | undefined): number {
  if (!usage) return 0;
  const p = priceOf(model);
  const n = (v: number | null | undefined) => v ?? 0;
  return (
    (n(usage.input_tokens) * p.input +
      n(usage.cache_creation_input_tokens) * p.input * 1.25 +
      n(usage.cache_read_input_tokens) * p.cacheRead +
      n(usage.output_tokens) * p.output) /
    1_000_000
  );
}

/** 1回の依頼（AI とのやり取り数回分）の費用を足し合わせる */
export class CostMeter {
  usd = 0;

  /** limitUsd：この依頼で使ってよい額（米ドル）。今日と今月の予算の残りの少ないほう（withAiBudget が決める） */
  constructor(public limitUsd = Infinity) {}

  add(model: string, usage: TokenUsage | null | undefined) {
    this.usd += costUsd(model, usage);
  }

  /** この依頼で、あと使える額 */
  get leftUsd(): number {
    return this.limitUsd - this.usd;
  }
}

/** 予算の残りが足りず、AI を呼ばなかった（この依頼で使える額では、短い返事も作れない） */
export class OverBudgetError extends Error {
  constructor() {
    super("今日のAIの残りでは、この依頼を最後まで処理できません。モードを下げるか、明日もう一度お試しください");
  }
}

/** 送る前の入力のトークン数を、文字数から多めに見積もる。英数字はおよそ0.7、日本語などは1.5トークン／字。ツールの説明などの見えない分も足す */
const INPUT_OVERHEAD_TOKENS = 1500;
export function estimateInputTokens(payload: unknown): number {
  const text = JSON.stringify(payload) ?? "";
  let ascii = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 128) ascii++;
  return Math.ceil(ascii * 0.7 + (text.length - ascii) * 1.5) + INPUT_OVERHEAD_TOKENS;
}

/** 1回に出させる返事の長さ（トークン）の下限。これより短くしないと予算に入らないときは、AI を呼ばない */
export const MIN_OUTPUT_TOKENS = 1024;

/**
 * 予算の残り（budgetUsd）に入るように、返事の長さの上限（max_tokens）を決める。
 * 入力はキャッシュの書き込み（1.25倍）として多めに見積もる。入らないときは OverBudgetError
 */
export function fitMaxTokens(model: string, inputTokens: number, requested: number, budgetUsd: number): number {
  const p = priceOf(model);
  const left = budgetUsd - (inputTokens * p.input * 1.25) / 1_000_000;
  const fit = Math.floor((left * 1_000_000) / p.output);
  if (fit < Math.min(requested, MIN_OUTPUT_TOKENS)) throw new OverBudgetError();
  return Math.min(requested, fit);
}
