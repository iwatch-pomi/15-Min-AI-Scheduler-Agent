"use client";

import { useRef } from "react";
import { addDays } from "@/lib/time";

const LABELS = ["月", "火", "水", "木", "金", "土", "日"];

/** 選んだ日を含む月〜日の1週間。タップで日を選び、左右スワイプで前後の週へ */
export default function WeekStrip({ date, today, onChange }: { date: string; today: string; onChange: (d: string) => void }) {
  const touchX = useRef<number | null>(null);
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; // 月曜=0
  const monday = addDays(date, -dow);
  const days = LABELS.map((label, i) => ({ label, date: addDays(monday, i) }));

  return (
    <div
      className="grid grid-cols-7 gap-1 select-none"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) onChange(addDays(date, dx < 0 ? 7 : -7));
      }}
      data-testid="week-strip"
    >
      {days.map((d) => {
        const selected = d.date === date;
        const isToday = d.date === today;
        return (
          <button
            key={d.date}
            onClick={() => onChange(d.date)}
            aria-pressed={selected}
            aria-label={`${Number(d.date.slice(5, 7))}月${Number(d.date.slice(8))}日`}
            className={`flex flex-col items-center gap-1 rounded-full py-2 transition stoic:rounded-xl ${
              selected ? "bg-accent text-on-accent shadow-[0_6px_16px_-6px_var(--accent)] stoic:shadow-none" : "text-text active:bg-surface stoic:text-heading"
            }`}
          >
            <span className={`text-[11px] ${selected ? "text-on-accent/70 stoic:font-bold stoic:text-on-accent" : "text-muted"}`}>{d.label}</span>
            <span className={`t-num text-lg font-medium leading-none tabular-nums ${selected ? "stoic:font-bold" : ""}`}>{Number(d.date.slice(8))}</span>
            <span className={`size-1 rounded-full ${isToday && !selected ? "bg-accent" : "bg-transparent"}`} />
          </button>
        );
      })}
    </div>
  );
}
