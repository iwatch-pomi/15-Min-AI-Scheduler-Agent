"use client";

import type { Block } from "@/lib/types";
import { addDays } from "@/lib/time";
import { formatDateJa } from "@/lib/ui";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import Timeline from "./Timeline";

export default function CalendarView(props: {
  date: string;
  today: string;
  tz: string;
  now: Date;
  events: Block[];
  error: string | null;
  onDateChange: (date: string) => void;
}) {
  const { date, today, tz, now, events, error, onDateChange } = props;
  const isToday = date === today;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 px-3 pt-3 pb-2">
        <button
          onClick={() => onDateChange(addDays(date, -1))}
          aria-label="前の日"
          className="grid size-10 place-items-center rounded-full text-muted active:bg-surface"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold tabular-nums">{formatDateJa(date)}</h1>
        <button
          onClick={() => onDateChange(addDays(date, 1))}
          aria-label="次の日"
          className="grid size-10 place-items-center rounded-full text-muted active:bg-surface"
        >
          <ChevronRightIcon className="size-5" />
        </button>
        <button
          onClick={() => onDateChange(today)}
          disabled={isToday}
          className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-accent shadow-card disabled:opacity-0"
        >
          今日
        </button>
      </header>
      {error && <p className="px-4 pb-2 text-sm text-now">{error}</p>}
      <Timeline date={date} tz={tz} events={events} now={now} isToday={isToday} />
    </div>
  );
}
