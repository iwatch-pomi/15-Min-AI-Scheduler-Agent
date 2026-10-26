import type { Block } from "./types";
import { DEFAULT_TZ, localDateString, zonedToUtc } from "./time";

/** デモモードの初期データ。Google の既存予定に見立てた「動かせない予定」と、AI ブロックを少し */
export function demoSeed(tz = DEFAULT_TZ): Block[] {
  const today = localDateString(new Date(), tz);
  const at = (h: number, m = 0) => zonedToUtc(today, h, m, tz).toISOString();
  return [
    { id: "demo-1", title: "チームMTG", start: at(10), end: at(11), ai: false },
    { id: "demo-2", title: "ランチ", start: at(12), end: at(13), ai: false },
    { id: "demo-3", title: "メール返信", start: at(13), end: at(13, 15), ai: true, energy: "LOW" },
    { id: "demo-4", title: "1on1", start: at(16), end: at(16, 30), ai: false },
  ];
}
