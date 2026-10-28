import { NextResponse, type NextRequest } from "next/server";

// すべてのリクエストの手前で動く（Next.js の Proxy）。
// 1. API への書き込み（POST など）は、このアプリの画面から来たものだけ通す（CSRF 対策）
// 2. 画面には、リクエストごとの nonce を使った Content-Security-Policy を付ける（XSS 対策）

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** 同じサイト（このアプリの画面）から送られたリクエストか */
export function isSameOrigin(req: Request): boolean {
  // ブラウザが付ける Sec-Fetch-Site（ほかのサイトからなら cross-site）
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return site === "same-origin";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function contentSecurityPolicy(nonce: string, dev = false): string {
  return [
    "default-src 'self'",
    // Next.js の scripts には nonce が自動で付く。開発時だけ React のデバッグに eval が要る
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // 画面の部品が style 属性を使うので unsafe-inline は残す（スクリプトは実行できない）
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // ログインで Google の画面へ移るため
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    // Auth.js（/api/auth）は自分の CSRF トークンで守っている
    if (!SAFE_METHODS.has(req.method) && !pathname.startsWith("/api/auth/") && !isSameOrigin(req)) {
      return NextResponse.json({ error: "このリクエストは受け付けられません" }, { status: 403 });
    }
    return NextResponse.next();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      // 静的ファイル（_next/static・画像・manifest）以外
      source: "/((?!_next/static|_next/image|.*\\.(?:png|ico|svg|webmanifest|txt)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
