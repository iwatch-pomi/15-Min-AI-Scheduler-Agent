import { afterEach, describe, expect, it, vi } from "vitest";
import { contentSecurityPolicy, isSameOrigin, proxy } from "@/proxy";
import { NextRequest } from "next/server";

const req = (method: string, path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://app.example${path}`, { method, headers: { host: "app.example", ...headers } });

describe("CSRF 対策（proxy）", () => {
  it("同じサイトからの書き込みは通す", () => {
    expect(isSameOrigin(req("POST", "/api/chat", { origin: "https://app.example", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(proxy(req("POST", "/api/chat", { origin: "https://app.example" })).status).toBe(200);
  });

  it("ほかのサイトからの書き込みは 403", () => {
    expect(proxy(req("POST", "/api/chat", { origin: "https://evil.example" })).status).toBe(403);
    expect(proxy(req("POST", "/api/undo", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(proxy(req("DELETE", "/api/messages", { origin: "null" })).status).toBe(403);
    // Origin も Sec-Fetch-Site もない（ブラウザ以外）
    expect(proxy(req("POST", "/api/blocks")).status).toBe(403);
  });

  it("読むだけ（GET）とログイン（/api/auth）は Auth.js などに任せる", () => {
    expect(proxy(req("GET", "/api/events", { origin: "https://evil.example" })).status).toBe(200);
    expect(proxy(req("POST", "/api/auth/signout", { origin: "https://evil.example" })).status).toBe(200);
  });

  it("画面には nonce 付きの CSP を付ける", () => {
    const res = proxy(req("GET", "/"));
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy("x", true)).toContain("unsafe-eval");
  });
});

describe("ストイックの入り口（/arc）", () => {
  it("/arc を開くと、デザインをストイックにしてトップへ移す", () => {
    for (const path of ["/arc", "/arc/"]) {
      const res = proxy(req("GET", path));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/");
      expect(res.cookies.get("ai15-theme")).toMatchObject({ value: "stoic", path: "/", sameSite: "lax" });
    }
  });

  it("トップは cookie を書き換えない（前回のデザインのまま）", () => {
    const res = proxy(req("GET", "/"));
    expect(res.cookies.get("ai15-theme")).toBeUndefined();
    expect(proxy(req("GET", "/archive")).status).toBe(200);
  });
});

describe("デモモード", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("本番（Vercel の Production）では DEMO_MODE を入れても有効にならない", async () => {
    const { isDemo } = await import("@/lib/demo");
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isDemo()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isDemo()).toBe(true);
  });
});
