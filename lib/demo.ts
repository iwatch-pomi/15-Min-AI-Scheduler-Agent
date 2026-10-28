import type { Block } from "./types";
import { DEFAULT_TZ, localDateString, zonedToUtc } from "./time";

/**
 * デモモード（ログインなし・メモリ保存）。本番（Vercel の Production）では、
 * 環境変数を間違えて入れても有効にしない（誰でもログインなしで AI を使えてしまうため）
 */
export const isDemo = () => process.env.DEMO_MODE === "1" && process.env.VERCEL_ENV !== "production";

/** デモモードの初期データ。メインのカレンダーに見立てた「動かせない予定」と、AI の予定を少し */
export function demoSeed(tz = DEFAULT_TZ): Block[] {
  const today = localDateString(new Date(), tz);
  const at = (h: number, m = 0) => zonedToUtc(today, h, m, tz).toISOString();
  return [
    { id: "demo-1", title: "朝の準備・朝食", start: at(8), end: at(8, 30), ai: false },
    { id: "demo-2", title: "授業：生物工学", start: at(8, 30), end: at(10), ai: false, location: "B棟 102教室" },
    { id: "demo-3", title: "研究室ミーティング", start: at(11), end: at(12), ai: false, location: "研究室" },
    { id: "demo-4", title: "昼食", start: at(12), end: at(12, 45), ai: false },
    { id: "demo-5", title: "メール返信", start: at(13), end: at(13, 15), ai: true, energy: "LOW" },
    { id: "demo-6", title: "実験：培養確認", start: at(14), end: at(16), ai: false, location: "3号室" },
    { id: "demo-7", title: "ジム", start: at(19), end: at(20), ai: false },
  ];
}
