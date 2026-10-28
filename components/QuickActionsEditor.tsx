"use client";

import { useState } from "react";
import { parseCommand } from "@/lib/commands";
import { DEFAULT_QUICK_ACTIONS, MAX_QUICK_ACTIONS, MAX_QUICK_ACTION_LENGTH, normalizeQuickActions } from "@/lib/quick-actions";
import { isUndoRequest } from "@/lib/ui";
import { ChevronRightIcon, PlusIcon, TrashIcon } from "./icons";

/** 節約モードで、AI を使わずにアプリで処理できる言葉か（「AIなし」の印・上限に達したときも押せるボタン） */
export const worksWithoutAi = (text: string) => isUndoRequest(text) || parseCommand(text) !== null;

/** クイックボタンを追加・並べ替え・削除するシート。保存すると、ほかの端末でも同じボタンが出る */
export default function QuickActionsEditor(props: {
  actions: string[];
  onSave: (actions: string[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const { actions, onSave, onClose } = props;
  const [rows, setRows] = useState(() => actions.map((text) => ({ key: crypto.randomUUID(), text })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, text: string) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, text } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((prev) => {
      const next = [...prev];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  const save = async () => {
    const list = normalizeQuickActions(rows.map((r) => r.text));
    setBusy(true);
    const message = await onSave(list);
    setBusy(false);
    if (message) setError(message);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 stoic:bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-3xl bg-bg px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-card stoic:border-t stoic:border-line"
        onClick={(e) => e.stopPropagation()}
        data-testid="quick-actions-editor"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-heading">クイックボタン</h2>
          <button onClick={onClose} className="text-sm text-muted">
            閉じる
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          AI画面の入力欄の上に出る、ワンタップのボタンです（{MAX_QUICK_ACTIONS}個まで）。ここで決めたボタンは、ほかの端末でも同じように出ます。
          「AIなし」の印が付いたものは、節約モードならAIを使わずに処理します。
        </p>

        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-1.5" data-testid="quick-action-row">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="上へ"
                  className="grid h-5 w-7 place-items-center text-muted disabled:opacity-25"
                >
                  <ChevronRightIcon className="size-4 -rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label="下へ"
                  className="grid h-5 w-7 place-items-center text-muted disabled:opacity-25"
                >
                  <ChevronRightIcon className="size-4 rotate-90" />
                </button>
              </div>
              <div className="flex min-w-0 flex-1 items-center rounded-xl bg-surface pr-2 ring-1 ring-line focus-within:ring-accent">
                <input
                  value={r.text}
                  onChange={(e) => update(r.key, e.target.value)}
                  maxLength={MAX_QUICK_ACTION_LENGTH}
                  placeholder="例：30分延長"
                  aria-label={`ボタン${i + 1}`}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[16px] outline-none"
                />
                {r.text.trim() && worksWithoutAi(r.text.trim()) && (
                  <span className="t-code shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-ink">AIなし</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                aria-label="このボタンを削除"
                className="grid size-10 shrink-0 place-items-center rounded-xl text-muted active:bg-surface"
              >
                <TrashIcon className="size-5" />
              </button>
            </li>
          ))}
        </ul>

        {rows.length < MAX_QUICK_ACTIONS && (
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { key: crypto.randomUUID(), text: "" }])}
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-accent/40 py-2.5 text-sm font-bold text-accent-ink"
          >
            <PlusIcon className="size-4" />
            ボタンを追加
          </button>
        )}

        {error && <p className="text-sm text-now">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRows(DEFAULT_QUICK_ACTIONS.map((text) => ({ key: crypto.randomUUID(), text })))}
            className="rounded-full border border-line px-4 py-2.5 text-sm text-muted stoic:rounded-xl"
          >
            初期値に戻す
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-on-accent disabled:opacity-60 stoic:rounded-xl"
          >
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
