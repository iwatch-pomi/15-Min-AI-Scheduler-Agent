"use client";

import { useState } from "react";
import { MAX_ROUTINE_MINUTES, daysLabel, durationLabel, endOf, minutesFromTimes, type Routine, type RoutineInput } from "@/lib/routines";

// 曜日は月曜はじまりで並べる（値は 0=日 … 6=土）
const WEEK = [
  { d: 1, label: "月" },
  { d: 2, label: "火" },
  { d: 3, label: "水" },
  { d: 4, label: "木" },
  { d: 5, label: "金" },
  { d: 6, label: "土" },
  { d: 0, label: "日" },
];
const PRESETS = [
  { label: "毎日", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "平日", days: [1, 2, 3, 4, 5] },
  { label: "土日", days: [0, 6] },
];
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
// よく使う長いルーティン（押すと名前・時刻・曜日が入る）
const TEMPLATES = [
  { label: "睡眠 23:00〜7:00", title: "睡眠", time: "23:00", end: "07:00", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "授業 9:00〜17:00", title: "授業", time: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] },
];

/** ルーティンの追加・編集（画面下から出るシート） */
export default function RoutineEditor(props: {
  routine: Routine | null;
  onSave: (input: RoutineInput) => Promise<string | null>;
  onDelete?: () => Promise<string | null>;
  onClose: () => void;
}) {
  const { routine, onSave, onDelete, onClose } = props;
  const [title, setTitle] = useState(routine?.title ?? "");
  const [time, setTime] = useState(routine?.time ?? "07:00");
  const [end, setEnd] = useState(routine ? endOf(routine.time, routine.minutes).time : "07:30");
  // 終了が開始と同じか前なら翌日として数える（23:00〜7:00 は8時間）
  const minutes = minutesFromTimes(time, end);
  const nextDay = endOf(time, minutes).nextDay;
  const [days, setDays] = useState<number[]>(routine?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const message = await fn();
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };
  const save = () => {
    if (!title.trim()) return setError("名前を入力してください");
    if (!days.length) return setError("曜日を1つ以上選んでください");
    if (minutes > MAX_ROUTINE_MINUTES) return setError("開始と終了を別の時刻にしてください");
    run(() => onSave({ title: title.trim(), time, minutes, days }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full max-w-xl space-y-4 rounded-t-3xl bg-bg px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-card"
        onClick={(e) => e.stopPropagation()}
        data-testid="routine-editor"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-heading">{routine ? "ルーティンを編集" : "ルーティンを追加"}</h2>
          <button onClick={onClose} className="text-sm text-muted">
            閉じる
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-muted">名前</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例：朝の準備、ジム、日記"
            aria-label="ルーティンの名前"
            className="w-full rounded-xl bg-surface px-3.5 py-2.5 text-[16px] outline-none ring-1 ring-line focus:ring-accent"
          />
        </label>

        {!routine && (
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => {
                  setTitle(t.title);
                  setTime(t.time);
                  setEnd(t.end);
                  setDays(t.days);
                }}
                className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-ink"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <label className="space-y-1.5">
            <span className="block text-xs font-bold text-muted">開始</span>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="開始時刻"
              className="rounded-xl bg-surface px-3 py-2.5 text-[16px] tabular-nums outline-none ring-1 ring-line focus:ring-accent"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <span className="pb-3 text-sm text-muted">〜</span>
          <label className="space-y-1.5">
            <span className="block text-xs font-bold text-muted">終了{nextDay && <span className="ml-1 text-accent-ink">（翌日）</span>}</span>
            <select
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              aria-label="終了時刻"
              className="rounded-xl bg-surface px-3 py-2.5 text-[16px] tabular-nums outline-none ring-1 ring-line focus:ring-accent"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {nextDay && t === end ? `翌 ${t}` : t}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-3 text-sm font-bold text-accent-ink" data-testid="routine-duration">
            {minutes > MAX_ROUTINE_MINUTES ? "—" : durationLabel(minutes)}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted">繰り返す曜日</span>
            <span className="text-xs text-accent-ink">{days.length ? daysLabel(days) : "未選択"}</span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEK.map(({ d, label }) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggle(d)}
                  aria-pressed={on}
                  className={`aspect-square rounded-full text-sm font-bold transition ${on ? "bg-accent text-on-accent" : "bg-surface text-muted ring-1 ring-line"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => setDays(p.days)} className="rounded-full bg-surface px-3 py-1 text-xs text-text ring-1 ring-line">
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-now">{error}</p>}
        <p className="text-[11px] text-muted">
          曜日は、始まる日の曜日です（平日の朝に起きる睡眠なら、日〜木の夜）。Google カレンダーの「AIスケジューラー」に繰り返しの予定として入ります。{routine ? "変更・削除は今日以降の分に反映され、過去の分はそのまま残ります。" : ""}
        </p>

        <div className="flex gap-2">
          {routine && onDelete && (
            <button
              onClick={() => window.confirm(`「${routine.title}」を今日以降なくしますか？（過去の分は残ります）`) && run(onDelete)}
              disabled={busy}
              className="rounded-full border border-now/40 px-4 py-2.5 text-sm font-bold text-now disabled:opacity-50"
            >
              削除
            </button>
          )}
          <button onClick={save} disabled={busy} className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-on-accent disabled:opacity-60">
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
