"use client";

import { useEffect, useMemo, useRef } from "react";
import { assignLanes } from "@/lib/slots";
import type { Block, Energy } from "@/lib/types";
import { dayRange, localTime, minutesBetween } from "@/lib/time";

/** 15分 = 1行の高さ(px) */
const ROW = 18;
const PX_PER_MIN = ROW / 15;
const DAY_MIN = 24 * 60;

const energyStyle: Record<Energy, string> = {
  HIGH: "bg-rose-500/90 text-white",
  MEDIUM: "bg-indigo-500/90 text-white",
  LOW: "bg-teal-500/90 text-white",
};

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
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
          {allDay.map((e) => (
            <span key={e.id} className="rounded-md bg-line px-2 py-0.5 text-xs text-muted">
              {e.title}
            </span>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="timeline">
        <div className="relative" style={{ height: DAY_MIN * PX_PER_MIN }}>
          {/* 15分ごとの罫線と時刻ラベル */}
          {Array.from({ length: 24 * 4 }, (_, i) => (
            <div
              key={i}
              className={`absolute left-12 right-0 border-t ${i % 4 === 0 ? "border-line" : "border-line-soft"}`}
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
          <div className="absolute inset-y-0 left-13 right-2">
            {timed.map((e) => {
              const start = Math.max(0, minutesBetween(dayStart, new Date(e.start)));
              const end = Math.min(DAY_MIN, minutesBetween(dayStart, new Date(e.end)));
              if (end <= start) return null;
              const lane = lanes.get(e.id) ?? { lane: 0, lanes: 1 };
              const height = (end - start) * PX_PER_MIN;
              const past = isToday && new Date(e.end) <= now;
              const style = e.ai
                ? energyStyle[e.energy ?? "MEDIUM"]
                : "bg-surface text-text border border-line [background-image:repeating-linear-gradient(135deg,transparent_0_6px,var(--line-soft)_6px_8px)]";
              return (
                <div
                  key={e.id}
                  className={`absolute overflow-hidden rounded-md px-2 shadow-sm ${style} ${past ? "opacity-45" : ""}`}
                  style={{
                    top: start * PX_PER_MIN + 1,
                    height: height - 2,
                    left: `${(lane.lane / lane.lanes) * 100}%`,
                    width: `calc(${100 / lane.lanes}% - 3px)`,
                  }}
                  title={`${localTime(new Date(e.start), tz)}-${localTime(new Date(e.end), tz)} ${e.title}`}
                >
                  <div className={`flex gap-1.5 leading-tight ${height < 40 ? "h-full items-center text-[11px]" : "flex-col pt-1 text-xs"}`}>
                    <span className="truncate font-medium">{e.title}</span>
                    <span className="shrink-0 tabular-nums opacity-80">
                      {localTime(new Date(e.start), tz)}–{localTime(new Date(e.end), tz)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 現在時刻の線 */}
          {isToday && nowMin >= 0 && nowMin < DAY_MIN && (
            <div className="pointer-events-none absolute left-11 right-0 z-10" style={{ top: nowMin * PX_PER_MIN }}>
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
