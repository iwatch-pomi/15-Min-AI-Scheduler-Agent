"use client";

import type { Block } from "@/lib/types";
import { localTime, minutesBetween } from "@/lib/time";
import { ClockIcon, SparkleIcon } from "./icons";

/** ホーム上部の「今やること」。今のブロックと残り時間、次の予定 */
export default function NowCard({ events, now, tz }: { events: Block[]; now: Date; tz: string }) {
  const timed = events.filter((e) => !e.allDay);
  const current = timed.find((e) => new Date(e.start) <= now && new Date(e.end) > now);
  const next = timed.find((e) => new Date(e.start) > now);

  if (!current) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 shadow-card" data-testid="nowbar">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <ClockIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">いまは空き時間</p>
          <p className="truncate text-sm">
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
      </div>
    );
  }

  const total = minutesBetween(new Date(current.start), new Date(current.end));
  const remainingSec = Math.max(0, Math.round((new Date(current.end).getTime() - now.getTime()) / 1000));
  const progress = Math.min(1, 1 - remainingSec / (total * 60));
  const mm = Math.floor(remainingSec / 60);
  const ss = String(remainingSec % 60).padStart(2, "0");

  return (
    <div className="overflow-hidden rounded-2xl bg-accent-soft ring-1 ring-accent/15" data-testid="nowbar">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white">
          <SparkleIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">
            <span className="mr-1 text-xs font-bold tracking-wider text-accent">NOW</span>
            {current.title}
          </p>
          <p className="truncate text-xs text-muted tabular-nums">
            {localTime(new Date(current.start), tz)}–{localTime(new Date(current.end), tz)}
            {next && ` ・ 次 ${localTime(new Date(next.start), tz)} ${next.title}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted">残り</p>
          <p className="text-xl font-bold leading-none tabular-nums text-accent">
            {mm}:{ss}
          </p>
        </div>
      </div>
      <div className="mx-4 mb-3 h-1.5 overflow-hidden rounded-full bg-surface/70">
        <div className="h-full rounded-full bg-accent transition-[width] duration-1000" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
