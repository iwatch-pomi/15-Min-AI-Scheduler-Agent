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

/** 1回の API 呼び出しの費用（米ドル） */
export function costUsd(model: string, usage: TokenUsage | null | undefined): number {
  if (!usage) return 0;
  const p = PRICES[model] ?? PRICES[model.replace(/-\d{8}$/, "")] ?? UNKNOWN;
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

  add(model: string, usage: TokenUsage | null | undefined) {
    this.usd += costUsd(model, usage);
  }
}
