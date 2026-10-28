"use client";

import type { Usage } from "@/lib/limits";

/** 今日の AI の残り（1日の予算に対する％）。依頼の内容が重いほど多く減る */
export default function UsageMeter({ usage, compact }: { usage: Usage; compact?: boolean }) {
  const p = usage.remainingPercent;
  const tone = usage.exhausted ? "bg-now" : p <= 20 ? "bg-amber-500" : "bg-accent";
  const text = usage.exhausted ? "text-now" : p <= 20 ? "text-amber-600 dark:text-amber-400" : "text-accent-ink";

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted" data-testid="usage">
        今日のAI 残り
        <span className={`text-sm font-bold tabular-nums ${text}`}>{p}%</span>
        <span className="h-1 w-12 overflow-hidden rounded-full bg-surface-2">
          <span className={`block h-full rounded-full ${tone}`} style={{ width: `${p}%` }} />
        </span>
      </span>
    );
  }
  return (
    <div className="space-y-1.5" data-testid="usage">
      <p className="flex items-baseline justify-between text-sm">
        <span>今日のAIの残り</span>
        <span className={`text-lg font-bold tabular-nums ${text}`}>{p}%</span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${p}%` }} />
      </div>
      <p className="text-[11px] text-muted">
        AIに頼んだ内容の量に応じて減ります（簡単な追加は少し、たくさんの組み直しは多め）。毎日0時にもとに戻ります。
      </p>
    </div>
  );
}
