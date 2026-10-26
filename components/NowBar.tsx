"use client";

import type { Block } from "@/lib/types";
import { localTime, minutesBetween } from "@/lib/time";

/** 画面上部の「今やること」。今のブロックと残り時間、次の予定 */
export default function NowBar({ events, now, tz }: { events: Block[]; now: Date; tz: string }) {
  const timed = events.filter((e) => !e.allDay);
  const current = timed.find((e) => new Date(e.start) <= now && new Date(e.end) > now);
  const next = timed.find((e) => new Date(e.start) > now);

  if (!current) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-4 py-3" data-testid="nowbar">
        <p className="text-xs font-medium text-muted">いまは空き時間</p>
        <p className="mt-0.5 text-sm">
          {next ? (
            <>
              次：<span className="tabular-nums">{localTime(new Date(next.start), tz)}</span> {next.title}
              <span className="text-muted">（あと{minutesBetween(now, new Date(next.start))}分）</span>
            </>
          ) : (
            <span className="text-muted">このあとの予定はありません</span>
          )}
        </p>
      </div>
    );
  }

  const total = minutesBetween(new Date(current.start), new Date(current.end));
  const remainingSec = Math.max(0, Math.round((new Date(current.end).getTime() - now.getTime()) / 1000));
  const progress = Math.min(1, 1 - remainingSec / (total * 60));
  const mm = Math.floor(remainingSec / 60);
  const ss = String(remainingSec % 60).padStart(2, "0");

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface" data-testid="nowbar">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="rounded-md bg-now/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-now">NOW</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{current.title}</p>
          <p className="text-xs text-muted tabular-nums">
            {localTime(new Date(current.start), tz)}–{localTime(new Date(current.end), tz)}
            {next && ` ・ 次：${localTime(new Date(next.start), tz)} ${next.title}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold tabular-nums leading-none">
            {mm}:{ss}
          </p>
          <p className="text-[10px] text-muted">残り</p>
        </div>
      </div>
      <div className="h-1 bg-line-soft">
        <div className="h-full bg-accent transition-[width] duration-1000" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
