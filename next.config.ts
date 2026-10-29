import type { NextConfig } from "next";

// すべての応答に付けるセキュリティヘッダー（画面の Content-Security-Policy は proxy.ts で付ける）
const securityHeaders = [
  // ほかのサイトの iframe に埋め込ませない（クリックジャッキング対策）
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 音声入力のマイクだけ、このアプリ自身に許す
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 紹介ページ（Claude Design で作り、JS なしで表示できる HTML にしたもの）。public/lp/ に置いてある
  async rewrites() {
    return [{ source: "/lp", destination: "/lp/index.html" }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API の応答（JSON）は、どこにも読み込ませない・キャッシュさせない
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
