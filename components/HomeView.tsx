"use client";

import type { Usage } from "@/lib/limits";
import { PLANS, briefCostPercent, firstPlanWith } from "@/lib/plans";
import type { Suggestion } from "@/lib/suggest";
import type { Block } from "@/lib/types";
import { dayRange, localTime, minutesBetween } from "@/lib/time";
import { durationLabel } from "@/lib/routines";
import { arcProgress, shortDuration, type Arc } from "@/lib/theme";
import { greeting, iconFor } from "@/lib/ui";
import AdSlot from "./AdSlot";
import BlockIcon from "./BlockIcon";
import {
  BulbIcon,
  CalendarIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  GaugeIcon,
  LeafIcon,
  Mascot,
  MoonIcon,
  PauseIcon,
  PinIcon,
  PlusIcon,
  RefreshIcon,
  RepeatIcon,
  SparkleIcon,
  SunIcon,
} from "./icons";
import { useTheme } from "./ThemeContext";
import WeekStrip from "./WeekStrip";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const SUGGESTION_ICONS = { calendar: CalendarIcon, bulb: BulbIcon, leaf: LeafIcon };
const STOIC_SUGGESTION_ICONS = { calendar: CalendarPlusIcon, bulb: BulbIcon, leaf: PauseIcon };
const EN_WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const EN_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

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
  usage: Usage;
  /** 今日あと何回「AIで更新」を使えるか（無料プランは1日1回）。null は回数の上限なし */
  briefsLeft: number | null;
  /** マイページの「プラン」を開く（上限・広告の案内から） */
  onOpenPlans: () => void;
  onRefreshSuggestions: () => void;
  /** ストイックの時間帯のひと言（AI の名言）。null は出さない、"" は作っている途中 */
  stoicQuote: string | null;
  error: string | null;
  demo?: boolean;
  onDateChange: (d: string) => void;
  onOpenAi: (draft?: string) => void;
}) {
  const { date, today, tz, now, events, suggestions, aiSuggest, suggestLoading, suggestError, usage, briefsLeft, onOpenPlans, onRefreshSuggestions, stoicQuote, error, demo, onDateChange, onOpenAi } = props;
  const usageExhausted = usage.exhausted;
  // 「AIで更新」を使えないプラン（無料）か、今日の分を使い切った（ライト）
  const rule = PLANS[usage.plan];
  const briefsNone = rule.briefsPerDay === 0;
  const briefsUsedUp = briefsLeft === 0;
  const briefFrom = PLANS[firstPlanWith((r) => r.briefsPerDay !== 0)];
  const timed = events.filter((e) => !e.allDay);
  const allDay = events.filter((e) => e.allDay);
  const isToday = date === today;
  const [, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const hello = greeting(Number(localTime(now, tz).slice(0, 2)));
  const current = isToday ? timed.find((e) => new Date(e.start) <= now && new Date(e.end) > now) : undefined;
  const next = isToday && !current ? timed.find((e) => new Date(e.start) > now) : undefined;
  const { theme, arc } = useTheme();
  const stoic = theme === "stoic";
  const Icons = stoic ? STOIC_SUGGESTION_ICONS : SUGGESTION_ICONS;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28">
        {stoic ? (
          <StoicHeader date={date} today={today} quote={stoicQuote} suggestionCount={suggestions.length} onOpenAi={() => onOpenAi()} arc={arc} />
        ) : (
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
        )}

        <div className="mt-5">
          <WeekStrip date={date} today={today} onChange={onDateChange} />
        </div>

        {demo && (
          <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            デモモード：予定はサーバーのメモリに保存されます
          </p>
        )}
        {error && <p className="mt-3 text-sm text-now">{error}</p>}

        {stoic && (
          <p className="t-label mt-5 mb-2.5 text-muted">
            {isToday ? "TODAY" : `${m}.${d}`} / {timed.length} BLOCKS
          </p>
        )}
        <section className={stoic ? "rounded-2xl bg-surface shadow-card" : "mt-5 rounded-3xl bg-surface/70 p-3 shadow-card"} data-testid="agenda">
          {next && (
            <p className="mb-2 flex items-center gap-1.5 px-1 text-xs text-muted stoic:t-code stoic:mb-0 stoic:border-b stoic:border-line-soft stoic:px-4 stoic:py-3 stoic:text-[11px]" data-testid="nowbar">
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
              <p className="font-medium text-heading">{stoic ? "まだ何も積まれていない。" : "予定はまだありません"}</p>
              <p className="mt-1 text-sm text-muted">{stoic ? "右下の ＋ から、コーチに予定を投げよう。" : "右下の ＋ から、AI にひと言で頼んでみましょう"}</p>
            </div>
          ) : (
            <ul className={stoic ? "divide-y divide-line-soft [&>li]:mx-4" : "space-y-2"}>
              {timed.map((e) => (
                <AgendaRow
                  key={e.id}
                  block={e}
                  tz={tz}
                  now={now}
                  day={dayRange(date, tz)}
                  current={e.id === current?.id}
                  past={isToday && new Date(e.end) <= now}
                  stoic={stoic}
                />
              ))}
            </ul>
          )}
        </section>

        {date >= today && (
          <section className="mt-6" data-testid="suggestions">
            <div className="mb-2 flex items-center gap-1.5 px-1">
              {stoic ? (
                <h2 className="t-num flex flex-1 items-center gap-2 text-[15px] font-bold tracking-[0.1em] text-heading">
                  <GaugeIcon className="size-[18px] text-accent-ink" strokeWidth={2} />
                  AI BRIEF
                </h2>
              ) : (
                <h2 className="flex flex-1 items-center gap-1.5 text-sm font-bold text-accent-ink">
                  <Mascot className="size-7" />
                  AIのおすすめ
                  <SparkleIcon className="size-4" />
                </h2>
              )}
              <button
                onClick={onRefreshSuggestions}
                disabled={suggestLoading || usageExhausted || briefsUsedUp}
                className="flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-accent-ink shadow-card disabled:opacity-50 stoic:h-[34px] stoic:gap-1.5 stoic:rounded-[10px] stoic:border stoic:border-line stoic:bg-transparent stoic:font-medium stoic:text-heading stoic:shadow-none"
                data-testid="refresh-suggestions"
              >
                <RefreshIcon className={`size-3.5 ${suggestLoading ? "animate-spin" : ""}`} />
                {suggestLoading ? "考え中…" : "AIで更新"}
              </button>
            </div>
            <p className="mb-2 px-1 text-[11px] text-muted" data-testid="suggest-note">
              {usageExhausted
                ? usage.reason === "month"
                  ? stoic
                    ? "今月のAIは上限に到達。更新できない"
                    : "今月のAIの利用上限に達したので、更新できません"
                  : stoic
                    ? "今日のAIは上限に到達。更新できない"
                    : "今日のAIの利用上限に達したので、更新できません"
                : aiSuggest
                  ? stoic
                    ? `AIが${localTime(new Date(aiSuggest.at), tz)}に考えたブリーフ（今日のAIを${aiSuggest.costPercent < 0.1 ? "0.1%未満" : `${aiSuggest.costPercent}%`}使用）`
                    : `AIが${localTime(new Date(aiSuggest.at), tz)}に考えたおすすめ（この更新で今日のAIを${aiSuggest.costPercent < 0.1 ? "0.1%未満" : `${aiSuggest.costPercent}%`}使いました）`
                  : stoic
                    ? `予定から自動で出したブリーフ。「AIで更新」でAIが考える${briefsLeft === null ? "（今日のAIを少し使う）" : ""}`
                    : `予定から自動で出したおすすめです。「AIで更新」でAIが考えます${briefsLeft === null ? "（今日のAIを少し使います）" : ""}`}
            </p>
            {briefsLeft !== null && (
              <p className="mb-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[11px] leading-relaxed" data-testid="brief-limit">
                {/* プラン（購入）の案内なので、ストイックでも丁寧語にする */}
                <span className="flex-1">
                  {briefsNone
                    ? `${rule.label}プランでは「AIで更新」は使えません。${briefFrom.label}から1日${briefFrom.briefsPerDay}回使えます。`
                    : briefsUsedUp
                      ? "今日の「AIで更新」は使いました。明日の0時にまた使えます。"
                      : `${rule.label}プランでは「AIで更新」は1日${rule.briefsPerDay}回までです。1回で今日のAIの${briefCostPercent(usage.plan)}%ほどを使います。`}
                </span>
                <button onClick={onOpenPlans} className="shrink-0 font-bold text-accent-ink" data-testid="brief-limit-plans">
                  プランを見る
                </button>
              </p>
            )}
            {suggestError && <p className="mb-2 px-1 text-xs text-now">{suggestError}</p>}
            {suggestions.length === 0 && (
              <p className="rounded-2xl bg-surface px-4 py-4 text-center text-sm text-muted shadow-card">{stoic ? "今は、伝えることはない。予定どおりに進めよう。" : "今のところ、おすすめはありません"}</p>
            )}
            <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl bg-surface shadow-card">
              {suggestions.map((s) => {
                const Icon = Icons[s.icon];
                return (
                  <li key={s.id}>
                    <button onClick={() => onOpenAi(s.prompt)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink stoic:size-[38px] stoic:rounded-[10px] stoic:bg-surface-2">
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
        <AdSlot plan={usage.plan} onOpenPlans={onOpenPlans} place="home" />
      </div>

      <button
        onClick={() => onOpenAi()}
        aria-label="AIに予定を依頼"
        className="absolute right-5 bottom-5 grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-[0_10px_24px_-8px_var(--accent)] transition active:scale-95 stoic:rounded-[18px] stoic:shadow-none"
      >
        <PlusIcon className="size-7" strokeWidth={stoic ? 2 : 2.4} />
      </button>
    </div>
  );
}

function StoicHeader(props: {
  date: string;
  today: string;
  quote: string | null;
  suggestionCount: number;
  onOpenAi: () => void;
  arc: Arc | null;
}) {
  const { date, today, quote, suggestionCount, onOpenAi, arc } = props;
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const progress = arc ? arcProgress(arc, today) : null;
  return (
    <header className="pt-6" data-testid="stoic-header">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-label text-muted">
            {EN_WEEKDAYS[dow]} · {String(d).padStart(2, "0")} {EN_MONTHS[m - 1]} {y}
          </p>
          <h1 className="t-num mt-1 text-[60px] font-bold leading-none tracking-[-0.03em] text-heading">
            {m}.{String(d).padStart(2, "0")}
          </h1>
        </div>
        <button
          onClick={onOpenAi}
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3 py-2.5 text-left active:scale-[0.98]"
          data-testid="assistant-card"
        >
          <GaugeIcon className="size-[22px] text-accent-ink" strokeWidth={2} />
          <span>
            <span className="t-num block text-[13px] font-bold tracking-[0.08em] text-heading">COACH</span>
            <span className="block text-[11px] text-muted">{suggestionCount ? `提案 ${suggestionCount}件` : "依頼する"}</span>
          </span>
          {suggestionCount > 0 && (
            <span className="t-num grid size-5 place-items-center rounded-md bg-accent text-xs font-bold text-on-accent">{suggestionCount}</span>
          )}
        </button>
      </div>
      {quote !== null && (
        <p className={`mt-2 min-h-5 text-[13px] text-muted transition-opacity duration-500 ${quote ? "opacity-100" : "opacity-0"}`} data-testid="stoic-quote">
          {quote}
        </p>
      )}
      {arc && progress && (
        <div className="mt-5" data-testid="arc">
          <div className="t-label flex items-center justify-between gap-3 tracking-[0.12em]">
            <span className="truncate text-accent-ink">{arc.name}</span>
            <span className="shrink-0 text-muted">
              {progress.status === "active"
                ? `DAY ${progress.day} / ${progress.total}`
                : progress.status === "before"
                  ? `あと${progress.daysLeft}日で開始`
                  : `COMPLETE / ${progress.total}`}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-sm bg-line-soft">
            <div className="h-full bg-accent" style={{ width: `${progress.ratio * 100}%` }} />
          </div>
        </div>
      )}
    </header>
  );
}

function AgendaRow(props: { block: Block; tz: string; now: Date; day: { start: Date; end: Date }; current: boolean; past: boolean; stoic: boolean }) {
  const { block, tz, now, day, current, past, stoic } = props;
  const start = new Date(block.start);
  const end = new Date(block.end);
  // 睡眠のように日付をまたぐ予定（前の日から続いている／次の日まで続く）
  const fromPrevDay = start < day.start;
  const toNextDay = end > day.end;
  const minutes = minutesBetween(start, end);
  const remainingSec = Math.max(0, Math.round((end.getTime() - now.getTime()) / 1000));

  if (stoic) {
    const dur = shortDuration(minutes);
    const range = fromPrevDay ? `— ${localTime(end, tz)}` : `${localTime(start, tz)} — ${localTime(end, tz)}`;
    return (
      <li className={`flex items-center gap-3.5 py-3.5 ${past ? "opacity-40" : ""}`}>
        <span className={`t-code w-10 shrink-0 text-[11px] ${current ? "text-accent-ink" : fromPrevDay ? "text-muted" : "text-heading"}`}>
          {fromPrevDay ? "前日" : localTime(start, tz)}
        </span>
        <span className={`grid size-[38px] shrink-0 place-items-center rounded-[10px] bg-surface-2 ${block.ai ? "text-accent-ink" : "text-muted"} ${current ? "ring-1 ring-accent" : ""}`}>
          <BlockIcon kind={iconFor(block)} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-heading">{block.title}</p>
          <p className="t-code mt-0.5 truncate text-[11px] text-muted">
            {range}
            {block.routine && " · ROUTINE"}
            {!block.ai && " · MAIN"}
          </p>
          {current && (
            <p className="t-code mt-1 text-[11px] font-bold text-accent-ink" data-testid="nowbar">
              NOW · 残り {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </p>
          )}
        </div>
        <span className="t-num shrink-0 text-xl font-bold text-heading">
          {dur.value}
          <span className="ml-0.5 text-xs text-muted">{dur.unit}</span>
        </span>
      </li>
    );
  }

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
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent tabular-nums" data-testid="nowbar">
              進行中・残り {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
            </p>
          )}
        </div>
        <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted">{minutes < 180 ? `${minutes}分` : durationLabel(minutes)}</span>
      </div>
    </li>
  );
}
