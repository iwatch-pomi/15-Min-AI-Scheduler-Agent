"use client";

import { useState } from "react";
import { daysLabel, rangeLabel, type Routine, type RoutineInput } from "@/lib/routines";
import RoutineEditor from "./RoutineEditor";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RepeatIcon } from "./icons";

/** マイページから開く「毎日のルーティン」の画面（一覧・追加・編集） */
export default function RoutineList(props: {
  routines: Routine[] | null;
  onSave: (id: string | null, input: RoutineInput) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
  onBack: () => void;
}) {
  const { routines, onSave, onDelete, onBack } = props;
  // 編集中のルーティン（"new" は追加）
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  // 始まる時刻の順に並べる
  const sorted = routines ? [...routines].sort((a, b) => a.time.localeCompare(b.time)) : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-testid="routine-page">
      <header className="grid grid-cols-[40px_1fr_40px] items-center pt-3 pb-3">
        <button onClick={onBack} aria-label="マイページに戻る" className="grid size-10 place-items-center rounded-full text-muted active:bg-surface stoic:size-11 stoic:rounded-xl stoic:border stoic:border-line stoic:text-heading">
          <ChevronLeftIcon className="size-5" />
        </button>
        <h1 className="text-center font-bold">毎日のルーティン</h1>
      </header>

      <p className="mb-3 px-1 text-xs text-muted">
        朝の準備・授業・睡眠など、毎日（決まった曜日に）くり返す予定です。登録すると、カレンダーに自動で入ります。
      </p>

      <div className="divide-y divide-line-soft overflow-hidden rounded-2xl bg-surface shadow-card">
        {sorted === null ? (
          <p className="px-4 py-3 text-sm text-muted">読み込み中…</p>
        ) : sorted.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">まだ登録されていません</p>
        ) : (
          sorted.map((r) => (
            <button key={r.id} onClick={() => setEditing(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2" data-testid="routine-row">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink stoic:hidden">
                <RepeatIcon className="size-4.5" />
              </span>
              {/* ストイックは色の帯（睡眠は灰色） */}
              <span className={`hidden h-9 w-1.5 shrink-0 rounded-[3px] stoic:block ${/睡眠|寝る|就寝/.test(r.title) ? "bg-blk-main" : "bg-accent"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-heading stoic:text-[15px] stoic:font-bold">{r.title}</span>
                <span className="block text-xs text-muted tabular-nums stoic:t-code stoic:mt-1 stoic:text-[11px]">
                  {rangeLabel(r)}・{daysLabel(r.days)}
                </span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted" />
            </button>
          ))
        )}
        <button onClick={() => setEditing("new")} className="flex w-full items-center justify-center gap-1 px-4 py-3 text-sm font-bold text-accent-ink active:bg-surface-2">
          <PlusIcon className="size-4" />
          ルーティンを追加
        </button>
      </div>

      {editing && (
        <RoutineEditor
          routine={editing === "new" ? null : editing}
          onSave={(input) => onSave(editing === "new" ? null : editing.id, input)}
          onDelete={editing === "new" ? undefined : () => onDelete(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
