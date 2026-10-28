import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

// アイコンは、開いているデザイン（cookie）のものを返す。
// ホーム画面に追加したときのデザインのアイコンになる（あとで切り替えても変わらない。変えたいときは追加し直す）
export async function generateMetadata(): Promise<Metadata> {
  const stoic = parseTheme((await cookies()).get(THEME_COOKIE)?.value) === "stoic";
  const prefix = stoic ? "/stoic-" : "/";
  return {
    title: "AIスケジュールアシスタント",
    description: "15分単位のタイムラインと、予定を組んでくれるAI秘書",
    manifest: stoic ? "/manifest-stoic.webmanifest" : "/manifest.webmanifest",
    icons: {
      icon: [
        { url: `${prefix}favicon-32.png`, sizes: "32x32" },
        { url: stoic ? "/stoic-icon-192.png" : "/icon-192.png", sizes: "192x192" },
      ],
      apple: `${prefix}apple-touch-icon.png`,
    },
    appleWebApp: { capable: true, title: "AIスケジュールアシスタント", statusBarStyle: stoic ? "black" : "default" },
  };
}

// デザイン（cookie）に合わせて、スマホの上の帯の色も変える
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor:
      theme === "stoic"
        ? "#0a0a0b"
        : [
            { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
            { media: "(prefers-color-scheme: dark)", color: "#161715" },
          ],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // デザインはサーバーで cookie から決めて付ける（最初の表示からその見た目にし、ちらつかせない）
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="ja" data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
