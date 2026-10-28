"use client";

import { useEffect, useMemo, useRef } from "react";
import { assignLanes } from "@/lib/slots";
import type { Block } from "@/lib/types";
import { dayRange, localTime, minutesBetween } from "@/lib/time";
import { shortDuration } from "@/lib/theme";
import { blockTone, iconFor } from "@/lib/ui";
import BlockIcon from "./BlockIcon";
import { RepeatIcon } from "./icons";
import { useTheme } from "./ThemeContext";

/** 15分 = 1行の高さ(px) */
const ROW = 18;
const PX_PER_MIN = ROW / 15;
const DAY_MIN = 24 * 60;

export default function Timeline(props: { date: string; tz: string; events: Block[]; now: Date; isToday: boolean }) {
  const { date, tz, events, now, isToday } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayStart = useMemo(() => dayRange(date, tz).start, [date, tz]);
  const timed = events.filter((e) => !e.allDay);
  const allDay = events.filter((e) => e.allDay);
  const lanes = useMemo(() => assignLanes(timed), [timed]);
  const nowMin = minutesBetween(dayStart, now);
  const stoic = useTheme().theme === "stoic";

  // 日付が変わったら「今」(他の日は朝7時) のあたりまでスクロール
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = isToday ? Math.max(0, minutesBetween(dayRange(date, tz).start, new Date()) - 60) : 7 * 60;
    el.scrollTop = target * PX_PER_MIN;
  }, [date, tz, isToday]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {allDay.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {allDay.map((e) => (
            <span key={e.id} className="rounded-full bg-surface px-2.5 py-1 text-xs text-muted shadow-card">
              終日・{e.title}
            </span>
          ))}
        </div>
      )}
      <div
        ref={scrollRef}
        className="relative mx-3 mb-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl bg-surface shadow-card stoic:mx-5 stoic:bg-[#0f0f11]"
        data-testid="timeline"
      >
        <div className="relative my-3" style={{ height: DAY_MIN * PX_PER_MIN }}>
          {/* 15分ごとの罫線と時刻ラベル */}
          {Array.from({ length: 24 * 4 }, (_, i) => (
            <div
              key={i}
              className={`absolute left-13 right-0 border-t ${i % 4 === 0 ? "border-line" : "border-line-soft"}`}
              style={{ top: i * ROW }}
            >
              {i % 4 === 0 && (
                <span className="t-code absolute -top-2 -left-12 w-10 text-right text-[11px] tabular-nums text-muted">
                  {String(i / 4).padStart(2, "0")}:00
                </span>
              )}
            </div>
          ))}

          {/* 予定 */}
          <div className="absolute inset-y-0 left-14 right-2">
            {timed.map((e) => {
              const start = Math.max(0, minutesBetween(dayStart, new Date(e.start)));
              const end = Math.min(DAY_MIN, minutesBetween(dayStart, new Date(e.end)));
              if (end <= start) return null;
              const lane = lanes.get(e.id) ?? { lane: 0, lanes: 1 };
              const height = (end - start) * PX_PER_MIN;
              const past = isToday && new Date(e.end) <= now;
              const tone = blockTone(e);
              const compact = height < 40;
              const time = `${localTime(new Date(e.start), tz)}–${localTime(new Date(e.end), tz)}`;
              if (stoic) {
                const dur = shortDuration(minutesBetween(new Date(e.start), new Date(e.end)));
                return (
                  <div
                    key={e.id}
                    className={`absolute overflow-hidden rounded-xl border px-3.5 ${e.ai ? "border-accent/35 bg-blk-ai-bg" : "border-line bg-blk-main-bg"} ${past ? "opacity-40" : ""}`}
                    style={{
                      top: start * PX_PER_MIN + 1,
                      height: height - 2,
                      left: `${(lane.lane / lane.lanes) * 100}%`,
                      width: `calc(${100 / lane.lanes}% - 3px)`,
                    }}
                    title={`${time} ${e.title}`}
                  >
                    <div className={`flex gap-2 leading-tight ${compact ? "h-full items-center text-[11px]" : "flex-col pt-2.5 text-xs"}`}>
                      <span className="flex min-w-0 items-center gap-2 font-bold text-heading">
                        {!compact && <BlockIcon kind={iconFor(e)} className={`size-4 shrink-0 ${e.ai ? "text-accent-ink" : "text-muted"}`} />}
                        <span className={`truncate ${compact ? "" : "text-[15px]"}`}>{e.title}</span>
                      </span>
                      <span className="t-code shrink-0 text-muted">{time.replace("–", " — ")}</span>
                      {!e.ai && !compact && <span className="t-label text-[9px] text-muted">MAIN · 変更しない</span>}
                    </div>
                    {height > 110 && (
                      <div className="absolute inset-x-3 bottom-2 flex items-end justify-between">
                        <span className="t-label flex items-center gap-1.5 text-[10px] text-accent-ink">
                          {e.routine && (
                            <>
                              <RepeatIcon className="size-3.5" />
                              ROUTINE
                            </>
                          )}
                        </span>
                        <span className="t-num text-[28px] font-bold tracking-[-0.02em] text-heading">
                          {dur.value}
                          <span className="ml-0.5 text-sm text-muted">{dur.unit}</span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={e.id}
                  className={`absolute overflow-hidden rounded-lg border-l-[3px] px-2 ${tone.bg} ${tone.line} ${past ? "opacity-50" : ""}`}
                  style={{
                    top: start * PX_PER_MIN + 1,
                    height: height - 2,
                    left: `${(lane.lane / lane.lanes) * 100}%`,
                    width: `calc(${100 / lane.lanes}% - 3px)`,
                  }}
                  title={`${time} ${e.title}`}
                >
                  <div className={`flex gap-1.5 leading-tight ${compact ? "h-full items-center text-[11px]" : "flex-col pt-1 text-xs"}`}>
                    <span className="truncate font-bold text-heading">
                      {e.routine && <RepeatIcon className="mr-1 inline size-3 align-[-1px] text-accent-ink" aria-label="ルーティン" />}
                      {e.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">{time}</span>
                    {!e.ai && !compact && <span className="text-[10px] text-muted">※ 変更しない</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 現在時刻の線 */}
          {isToday && nowMin >= 0 && nowMin < DAY_MIN && (
            <div className="pointer-events-none absolute left-12 right-0 z-10" style={{ top: nowMin * PX_PER_MIN }}>
              <div className="relative border-t-2 border-now">
                <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-now" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
