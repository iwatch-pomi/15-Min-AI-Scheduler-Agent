"use client";

import type { Usage } from "@/lib/limits";

/** 今日の AI の残り回数。使うたびに減り、残りが少ないと色が変わる */
export default function UsageMeter({ usage, compact }: { usage: Usage; compact?: boolean }) {
  const ratio = usage.limit ? usage.remaining / usage.limit : 0;
  const tone = usage.remaining === 0 ? "bg-now" : ratio <= 0.2 ? "bg-amber-500" : "bg-accent";
  const text = usage.remaining === 0 ? "text-now" : ratio <= 0.2 ? "text-amber-600 dark:text-amber-400" : "text-accent-ink";

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted" data-testid="usage">
        今日のAI あと
        <span className={`text-sm font-bold tabular-nums ${text}`}>{usage.remaining}</span>/{usage.limit}回
      </span>
    );
  }
  return (
    <div className="space-y-1.5" data-testid="usage">
      <p className="flex items-baseline justify-between text-sm">
        <span>今日のAIの残り</span>
        <span className="text-muted">
          <span className={`text-lg font-bold tabular-nums ${text}`}>{usage.remaining}</span> / {usage.limit}回
        </span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="text-[11px] text-muted">AIに送るたびに1回減り、毎日0時にもとに戻ります。</p>
    </div>
  );
}
