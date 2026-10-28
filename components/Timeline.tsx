"use client";

import { useEffect, useMemo, useRef } from "react";
import { assignLanes } from "@/lib/slots";
import type { Block } from "@/lib/types";
import { dayRange, localTime, minutesBetween } from "@/lib/time";
import { blockTone } from "@/lib/ui";

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
        className="relative mx-3 mb-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl bg-surface shadow-card"
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
                <span className="absolute -top-2 -left-12 w-10 text-right text-[11px] tabular-nums text-muted">
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
                    <span className="truncate font-bold text-heading">{e.title}</span>
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
