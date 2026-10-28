/** 1ユーザー1日あたりの AI 呼び出し回数の上限 */
export function dailyChatLimit(): number {
  const n = Number(process.env.DAILY_CHAT_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 50;
}
