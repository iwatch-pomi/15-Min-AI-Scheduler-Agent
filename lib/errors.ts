/** ログインし直しが必要なとき（未ログイン、Google の権限切れ・期限切れ）に投げる */
export class UnauthorizedError extends Error {}

/** Google のリフレッシュトークンが失効・取り消しされたときのエラーか */
export function isInvalidGrant(err: unknown): boolean {
  const e = err as { response?: { data?: { error?: string } }; message?: string } | null;
  return e?.response?.data?.error === "invalid_grant" || /invalid_grant/.test(e?.message ?? "");
}
