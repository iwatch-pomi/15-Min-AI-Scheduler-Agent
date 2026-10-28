"use client";

import type { Block } from "@/lib/types";
import { localTime, minutesBetween } from "@/lib/time";
import { blockTone, formatDateJa } from "@/lib/ui";
import { AppLogo, CalendarIcon, CheckCircleIcon, LockIcon, PlusIcon, SparkleIcon } from "./icons";
import NowCard from "./NowCard";

export default function HomeView(props: {
  today: string;
  tz: string;
  now: Date;
  events: Block[];
  error: string | null;
  demo?: boolean;
  onOpenAi: () => void;
}) {
  const { today, tz, now, events, error, demo, onOpenAi } = props;
  const timed = events.filter((e) => !e.allDay);
  const allDay = events.filter((e) => e.allDay);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24">
        <header className="flex items-center justify-between pt-4 pb-3">
          <h1 className="text-2xl font-bold tabular-nums">{formatDateJa(today)}</h1>
          <AppLogo className="size-9 rounded-[10px] shadow-card" />
        </header>

        {demo && (
          <p className="mb-3 rounded-xl bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            デモモード：予定はサーバーのメモリに保存されます
          </p>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-muted">今日の予定</h2>
          <NowCard events={events} now={now} tz={tz} />
          {error && <p className="text-sm text-now">{error}</p>}

          {allDay.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allDay.map((e) => (
                <span key={e.id} className="rounded-full bg-surface px-2.5 py-1 text-xs text-muted shadow-card">
                  終日・{e.title}
                </span>
              ))}
            </div>
          )}

          {timed.length === 0 ? (
            <div className="rounded-2xl bg-surface px-5 py-8 text-center shadow-card">
              <p className="font-medium">今日の予定はまだありません</p>
              <p className="mt-1 text-sm text-muted">右下の ＋ から、AI にひと言で頼んでみましょう</p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl bg-surface shadow-card" data-testid="agenda">
              {timed.map((e) => (
                <AgendaRow key={e.id} block={e} tz={tz} now={now} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <button
        onClick={onOpenAi}
        aria-label="AIに予定を依頼"
        className="absolute right-5 bottom-5 grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 transition active:scale-95"
      >
        <PlusIcon className="size-7" strokeWidth={2.4} />
      </button>
    </div>
  );
}

function AgendaRow({ block, tz, now }: { block: Block; tz: string; now: Date }) {
  const start = new Date(block.start);
  const end = new Date(block.end);
  const current = start <= now && end > now;
  const past = end <= now;
  const tone = blockTone(block);
  const minutes = minutesBetween(start, end);

  return (
    <li
      className={`flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0 ${current ? "bg-accent-soft/60" : ""} ${past ? "opacity-55" : ""}`}
    >
      <span className="w-11 shrink-0 text-sm tabular-nums text-muted">{localTime(start, tz)}</span>
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone.bg} ${tone.dot}`}>
        {block.ai ? <SparkleIcon className="size-4.5" /> : <CalendarIcon className="size-4.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium">{block.title}</p>
        <p className="flex items-center gap-1 text-xs text-muted">
          {block.ai ? (
            <>
              {minutes}分 ・ AI
            </>
          ) : (
            <>
              <LockIcon className="size-3" /> メインのカレンダー
            </>
          )}
          {current && <span className="ml-1 font-medium text-accent">・ 進行中</span>}
        </p>
      </div>
      {past && <CheckCircleIcon className="size-5 shrink-0 text-ok" />}
    </li>
  );
}
