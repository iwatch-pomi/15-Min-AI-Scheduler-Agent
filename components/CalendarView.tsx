"use client";

import type { Block } from "@/lib/types";
import { addDays } from "@/lib/time";
import { formatDateJa } from "@/lib/ui";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { useTheme } from "./ThemeContext";
import Timeline from "./Timeline";
import WeekStrip from "./WeekStrip";

const EN_DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

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
  const { theme } = useTheme();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {theme === "stoic" ? (
        <header className="flex items-center gap-2 px-5 pt-5 pb-3" data-testid="stoic-calendar-header">
          <button
            onClick={() => onDateChange(addDays(date, -1))}
            aria-label="前の日"
            className="grid size-11 place-items-center rounded-xl border border-line text-heading active:bg-surface"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="t-label text-muted">{EN_DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]}</p>
            <h1 className="t-num text-[22px] font-bold leading-tight tracking-[-0.01em] text-heading">
              {Number(date.slice(5, 7))}.{date.slice(8)}
            </h1>
          </div>
          <button
            onClick={() => onDateChange(addDays(date, 1))}
            aria-label="次の日"
            className="grid size-11 place-items-center rounded-xl border border-line text-heading active:bg-surface"
          >
            <ChevronRightIcon className="size-5" />
          </button>
          <button
            onClick={() => onDateChange(today)}
            disabled={isToday}
            className="t-num h-11 rounded-xl border border-accent px-3.5 text-xs font-bold tracking-[0.1em] text-accent-ink disabled:opacity-40"
          >
            TODAY
          </button>
        </header>
      ) : (
      <header className="flex items-center gap-1 px-3 pt-3 pb-2">
        <button
          onClick={() => onDateChange(addDays(date, -1))}
          aria-label="前の日"
          className="grid size-10 place-items-center rounded-full text-muted active:bg-surface"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-heading tabular-nums">{formatDateJa(date)}</h1>
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
          className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-accent-ink shadow-card disabled:opacity-0"
        >
          今日
        </button>
      </header>
      )}
      <div className="px-4 pb-3 stoic:px-5">
        <WeekStrip date={date} today={today} onChange={onDateChange} />
      </div>
      {error && <p className="px-4 pb-2 text-sm text-now">{error}</p>}
      <Timeline date={date} tz={tz} events={events} now={now} isToday={isToday} />
    </div>
  );
}
