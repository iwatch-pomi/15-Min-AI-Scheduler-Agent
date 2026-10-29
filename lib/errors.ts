/** ログインし直しが必要なとき（未ログイン、Google の権限切れ・期限切れ）に投げる */
export class UnauthorizedError extends Error {}

/** お支払い（Stripe）の設定（環境変数）がまだ無いときに投げる */
export class BillingNotConfiguredError extends Error {
  constructor() {
    super("お支払いはまだ準備中です");
  }
}

/** Google のリフレッシュトークンが失効・取り消しされたときのエラーか */
export function isInvalidGrant(err: unknown): boolean {
  const e = err as { response?: { data?: { error?: string } }; message?: string } | null;
  return e?.response?.data?.error === "invalid_grant" || /invalid_grant/.test(e?.message ?? "");
}

/** OAuth の権限（スコープ）が足りないときのエラーか */
export function isInsufficientScope(err: unknown): boolean {
  const e = err as {
    code?: number | string;
    status?: number;
    message?: string;
    errors?: { reason?: string }[];
    response?: { data?: { error?: { details?: { reason?: string }[] } } };
  } | null;
  if (!e) return false;
  const status = Number(e.code ?? e.status);
  if (status !== 403) return false;
  const reasons = [...(e.errors ?? []).map((x) => x.reason), ...(e.response?.data?.error?.details ?? []).map((x) => x.reason)];
  return (
    reasons.includes("insufficientPermissions") ||
    reasons.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") ||
    /insufficient authentication scopes/i.test(e.message ?? "")
  );
}
