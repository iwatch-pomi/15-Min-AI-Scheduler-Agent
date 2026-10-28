"use client";

import { useState } from "react";
import { arcProgress, isValidArc, type Arc } from "@/lib/theme";

/** ストイック：挑戦（Winter Arc など）の名前と期間を決めるシート */
export default function ArcEditor(props: { arc: Arc; today: string; onSave: (arc: Arc) => void; onReset: () => void; onClose: () => void }) {
  const { arc, today, onSave, onReset, onClose } = props;
  const [name, setName] = useState(arc.name);
  const [start, setStart] = useState(arc.start);
  const [end, setEnd] = useState(arc.end);
  const draft = { name: name.trim(), start, end };
  const valid = isValidArc(draft);
  const progress = valid ? arcProgress(draft, today) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full max-w-xl space-y-4 rounded-t-3xl border-t border-line bg-bg px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
        data-testid="arc-editor"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-heading">挑戦の期間</h2>
          <button onClick={onClose} className="text-sm text-muted">
            閉じる
          </button>
        </div>
        <label className="block space-y-1.5">
          <span className="t-label text-muted">NAME</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="WINTER ARC"
            className="t-code w-full rounded-xl border border-line bg-surface px-4 py-3 text-[16px] uppercase outline-none focus:border-accent"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="t-label text-muted">START</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="t-code w-full rounded-xl border border-line bg-surface px-3 py-3 text-[16px] outline-none focus:border-accent"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="t-label text-muted">END</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="t-code w-full rounded-xl border border-line bg-surface px-3 py-3 text-[16px] outline-none focus:border-accent"
            />
          </label>
        </div>
        <p className="t-code text-xs text-muted">
          {!valid
            ? "名前を入れ、終了日を開始日以降にしてください"
            : progress!.status === "active"
              ? `${progress!.total}日間 · 今日は DAY ${progress!.day}`
              : progress!.status === "before"
                ? `${progress!.total}日間 · あと${progress!.daysLeft}日で開始`
                : `${progress!.total}日間 · 完了`}
        </p>
        <div className="flex gap-2">
          <button onClick={onReset} className="rounded-xl border border-line px-4 py-2.5 text-sm text-muted">
            初期値に戻す
          </button>
          <button
            onClick={() => valid && onSave(draft)}
            disabled={!valid}
            className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-bold text-on-accent disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
