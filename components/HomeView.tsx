"use client";

import type { Suggestion } from "@/lib/suggest";
import type { Block } from "@/lib/types";
import { dayRange, localTime, minutesBetween } from "@/lib/time";
import { durationLabel } from "@/lib/routines";
import { greeting, iconFor } from "@/lib/ui";
import BlockIcon from "./BlockIcon";
import { BulbIcon, CalendarIcon, ChevronRightIcon, LeafIcon, Mascot, MoonIcon, PinIcon, PlusIcon, RefreshIcon, RepeatIcon, SparkleIcon, SunIcon } from "./icons";
import WeekStrip from "./WeekStrip";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const SUGGESTION_ICONS = { calendar: CalendarIcon, bulb: BulbIcon, leaf: LeafIcon };

export default function HomeView(props: {
  date: string;
  today: string;
  tz: string;
  now: Date;
  events: Block[];
  suggestions: Suggestion[];
  /** AI で作ったおすすめなら、その情報（null は決まりごとで作ったもの） */
  aiSuggest: { costPercent: number; at: string } | null;
  suggestLoading: boolean;
  suggestError: string | null;
  usageExhausted: boolean;
  onRefreshSuggestions: () => void;
  error: string | null;
  demo?: boolean;
  onDateChange: (d: string) => void;
  onOpenAi: (draft?: string) => void;
}) {
  const { date, today, tz, now, events, suggestions, aiSuggest, suggestLoading, suggestError, usageExhausted, onRefreshSuggestions, error, demo, onDateChange, onOpenAi } = props;
  const timed = events.filter((e) => !e.allDay);
  const allDay = events.filter((e) => e.allDay);
  const isToday = date === today;
  const [, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const hello = greeting(Number(localTime(now, tz).slice(0, 2)));
  const current = isToday ? timed.find((e) => new Date(e.start) <= now && new Date(e.end) > now) : undefined;
  const next = isToday && !current ? timed.find((e) => new Date(e.start) > now) : undefined;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28">
        <header className="pt-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="flex min-w-0 items-baseline gap-0.5 text-heading">
              <span className="text-[34px] font-bold leading-none tabular-nums">{m}</span>
              <span className="text-lg font-bold">月</span>
              <span className="text-[34px] font-bold leading-none tabular-nums">{d}</span>
              <span className="text-lg font-bold">日</span>
              <span className="ml-1 text-lg font-medium">({weekday})</span>
            </h1>
            <button
              onClick={() => onOpenAi()}
              className="flex shrink-0 items-center gap-2 rounded-2xl border border-line bg-surface py-2 pr-2 pl-2.5 text-left shadow-card transition active:scale-[0.98]"
              data-testid="assistant-card"
            >
              <Mascot className="size-9" />
              <span>
                <span className="block text-xs font-bold text-accent-ink">AIアシスタント</span>
                <span className="block text-[10px] text-muted">
                  {suggestions.length ? `${suggestions.length}つの提案があります` : "なんでも頼んでね"}
                </span>
              </span>
              <ChevronRightIcon className="size-4 text-muted" />
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            {hello.text}
            {hello.icon === "sun" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          </p>
        </header>

        <div className="mt-5">
          <WeekStrip date={date} today={today} onChange={onDateChange} />
        </div>

        {demo && (
          <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            デモモード：予定はサーバーのメモリに保存されます
          </p>
        )}
        {error && <p className="mt-3 text-sm text-now">{error}</p>}

        <section className="mt-5 rounded-3xl bg-surface/70 p-3 shadow-card" data-testid="agenda">
          {next && (
            <p className="mb-2 flex items-center gap-1.5 px-1 text-xs text-muted" data-testid="nowbar">
              <span className="size-1.5 shrink-0 rounded-full bg-accent" />
              次は <span className="tabular-nums">{localTime(new Date(next.start), tz)}</span>
              <span className="truncate font-medium text-text">{next.title}</span>
              <span className="shrink-0">（あと{minutesBetween(now, new Date(next.start))}分）</span>
            </p>
          )}
          {allDay.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 px-1">
              {allDay.map((e) => (
                <span key={e.id} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
                  終日・{e.title}
                </span>
              ))}
            </div>
          )}
          {timed.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="font-medium text-heading">予定はまだありません</p>
              <p className="mt-1 text-sm text-muted">右下の ＋ から、AI にひと言で頼んでみましょう</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {timed.map((e) => (
                <AgendaRow
                  key={e.id}
                  block={e}
                  tz={tz}
                  now={now}
                  day={dayRange(date, tz)}
                  current={e.id === current?.id}
                  past={isToday && new Date(e.end) <= now}
                />
              ))}
            </ul>
          )}
        </section>

        {date >= today && (
          <section className="mt-6" data-testid="suggestions">
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <h2 className="flex flex-1 items-center gap-1.5 text-sm font-bold text-accent-ink">
                <Mascot className="size-7" />
                AIのおすすめ
                <SparkleIcon className="size-4" />
              </h2>
              <button
                onClick={onRefreshSuggestions}
                disabled={suggestLoading || usageExhausted}
                className="flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-accent-ink shadow-card disabled:opacity-50"
                data-testid="refresh-suggestions"
              >
                <RefreshIcon className={`size-3.5 ${suggestLoading ? "animate-spin" : ""}`} />
                {suggestLoading ? "考え中…" : "AIで更新"}
              </button>
            </div>
            <p className="mb-2 px-1 text-[11px] text-muted" data-testid="suggest-note">
              {usageExhausted
                ? "今日のAIの利用上限に達したので、更新できません"
                : aiSuggest
                  ? `AIが${localTime(new Date(aiSuggest.at), tz)}に考えたおすすめ（この更新で今日のAIを${aiSuggest.costPercent < 0.1 ? "0.1%未満" : `${aiSuggest.costPercent}%`}使いました）`
                  : "予定から自動で出したおすすめです。「AIで更新」でAIが考えます（今日のAIを少し使います）"}
            </p>
            {suggestError && <p className="mb-2 px-1 text-xs text-now">{suggestError}</p>}
            {suggestions.length === 0 && (
              <p className="rounded-2xl bg-surface px-4 py-4 text-center text-sm text-muted shadow-card">今のところ、おすすめはありません</p>
            )}
            <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl bg-surface shadow-card">
              {suggestions.map((s) => {
                const Icon = SUGGESTION_ICONS[s.icon];
                return (
                  <li key={s.id}>
                    <button onClick={() => onOpenAi(s.prompt)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                        <Icon className="size-5" />
                      </span>
                      <span className="flex-1 text-[13px] leading-relaxed">{s.text}</span>
                      <ChevronRightIcon className="size-4 shrink-0 text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <button
        onClick={() => onOpenAi()}
        aria-label="AIに予定を依頼"
        className="absolute right-5 bottom-5 grid size-14 place-items-center rounded-full bg-accent text-white shadow-[0_10px_24px_-8px_var(--accent)] transition active:scale-95"
      >
        <PlusIcon className="size-7" strokeWidth={2.4} />
      </button>
    </div>
  );
}

function AgendaRow(props: { block: Block; tz: string; now: Date; day: { start: Date; end: Date }; current: boolean; past: boolean }) {
  const { block, tz, now, day, current, past } = props;
  const start = new Date(block.start);
  const end = new Date(block.end);
  // 睡眠のように日付をまたぐ予定（前の日から続いている／次の日まで続く）
  const fromPrevDay = start < day.start;
  const toNextDay = end > day.end;
  const minutes = minutesBetween(start, end);
  const remainingSec = Math.max(0, Math.round((end.getTime() - now.getTime()) / 1000));

  return (
    <li className={`flex gap-3 ${past ? "opacity-50" : ""}`}>
      <span className="w-10 shrink-0 pt-3.5 text-right text-xs tabular-nums text-muted">{fromPrevDay ? "前日" : localTime(start, tz)}</span>
      <div
        className={`flex min-w-0 flex-1 items-start gap-3 rounded-2xl px-3.5 py-3 ${block.ai ? "bg-blk-ai-bg" : "bg-blk-main-bg"} ${
          current ? "ring-2 ring-accent" : ""
        }`}
      >
        <BlockIcon kind={iconFor(block)} className={`mt-0.5 size-5 shrink-0 ${block.ai ? "text-accent-ink" : "text-text"}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-heading">{block.title}</p>
          {(fromPrevDay || toNextDay) && (
            <p className="mt-0.5 text-[11px] text-muted tabular-nums" data-testid="overnight">
              {fromPrevDay ? `〜${localTime(end, tz)}まで` : `${localTime(start, tz)}〜翌${localTime(end, tz)}`}
            </p>
          )}
          {block.routine && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-accent-ink">
              <RepeatIcon className="size-3" />
              ルーティン
            </p>
          )}
          {block.location && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
              <PinIcon className="size-3.5 shrink-0" />
              {block.location}
            </p>
          )}
          {current && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white tabular-nums" data-testid="nowbar">
              進行中・残り {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </p>
          )}
        </div>
        <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted">{minutes < 180 ? `${minutes}分` : durationLabel(minutes)}</span>
      </div>
    </li>
  );
}
