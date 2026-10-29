"use client";

import type { Usage } from "@/lib/limits";
import { useTheme } from "./ThemeContext";

/** AI の残り（今日の残りと今月の残りの、少ないほう）。依頼の内容が重いほど多く減る */
export default function UsageMeter({ usage, compact }: { usage: Usage; compact?: boolean }) {
  const p = usage.remainingPercent;
  const tone = usage.exhausted ? "bg-now" : p <= 20 ? "bg-amber-500" : "bg-accent";
  const text = usage.exhausted ? "text-now" : p <= 20 ? "text-amber-600 dark:text-amber-400" : "text-accent-ink";

  const stoic = useTheme().theme === "stoic";
  // 今月の残りのほうが少ないときは、見出しも「今月」にする
  const byMonth = usage.reason === "month" || (!usage.exhausted && usage.monthRemainingPercent < 100 && usage.monthRemainingPercent <= p);
  const title = byMonth ? "今月のAIの残り" : "今日のAIの残り";
  const month = (
    <p className="flex items-baseline justify-between text-[11px] text-muted" data-testid="usage-month">
      <span>今月の残り</span>
      <span className="t-num tabular-nums">{usage.monthRemainingPercent}%</span>
    </p>
  );

  if (stoic && compact) {
    return (
      <span className="flex items-center gap-2.5" data-testid="usage">
        <span className="t-label text-[10px] tracking-[0.12em] text-muted">AI LEFT</span>
        <span className="h-1 w-20 overflow-hidden rounded-sm bg-line-soft">
          <span className={`block h-full ${tone}`} style={{ width: `${p}%` }} />
        </span>
        <span className={`t-num text-sm font-bold ${text}`}>{p}%</span>
      </span>
    );
  }
  if (stoic) {
    // 10区切りのバー
    return (
      <div className="space-y-2.5" data-testid="usage">
        <p className="flex items-baseline justify-between text-sm">
          <span>{title}</span>
          <span className={`t-num text-[28px] font-bold tracking-[-0.02em] ${text}`}>
            {p}
            <span className="text-sm">%</span>
          </span>
        </p>
        <div className="grid grid-cols-10 gap-[3px]">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`h-1.5 rounded-[1px] ${p >= (i + 1) * 10 - 5 ? tone : "bg-line"}`} />
          ))}
        </div>
        {month}
        <p className="text-[11px] text-muted">
          AIに頼んだ内容の量に応じて減ります（簡単な追加は少し、たくさんの組み直しは多め）。今日の分は毎日 <span className="t-code">00:00</span>、月の分は毎月1日にリセット。
        </p>
      </div>
    );
  }
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted" data-testid="usage">
        {byMonth ? "今月のAI 残り" : "今日のAI 残り"}
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
        <span>{title}</span>
        <span className={`text-lg font-bold tabular-nums ${text}`}>{p}%</span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${p}%` }} />
      </div>
      {month}
      <p className="text-[11px] text-muted">
        AIに頼んだ内容の量に応じて減ります（簡単な追加は少し、たくさんの組み直しは多め）。今日の分は毎日0時に、月の分は毎月1日にもとに戻ります。
      </p>
    </div>
  );
}

/** 上限に達したときの文（今日／今月） */
export function exhaustedText(usage: Usage, stoic: boolean): string {
  if (usage.reason === "month") return stoic ? "今月のAIは上限に到達。来月1日に戻る。" : "今月のAIの利用上限に達しました。来月1日にもとに戻ります。";
  return stoic ? "今日のAIは上限に到達。明日0時に戻る。" : "今日のAIの利用上限に達しました。明日の0時にもとに戻ります。";
}
