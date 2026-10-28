/** 1ユーザー1日あたりの AI 呼び出し回数の上限 */
export function dailyChatLimit(): number {
  const n = Number(process.env.DAILY_CHAT_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export type Usage = { used: number; limit: number; remaining: number };

export function usageOf(used: number): Usage {
  const limit = dailyChatLimit();
  return { used: Math.min(used, limit), limit, remaining: Math.max(0, limit - used) };
}
