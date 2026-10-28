"use client";

import { useState } from "react";
import type { ManualChange } from "@/lib/manual";
import { localDateString, localTime, minutesBetween, zonedToUtc } from "@/lib/time";
import type { ChangeItem } from "@/lib/ui";
import { CheckCircleIcon, PencilIcon, PlusIcon, TrashIcon, UndoIcon } from "./icons";

const KIND_LABEL: Record<ChangeItem["kind"], string> = { create: "追加", update: "変更", delete: "削除" };
const KIND_STYLE: Record<ChangeItem["kind"], string> = {
  create: "border-l-blk-blue",
  update: "border-l-blk-blue",
  delete: "border-l-blk-gray",
};

/** 15分刻みの時刻の選択肢（00:00〜23:45） */
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const MINUTE_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240];

type Row = { key: string; id?: string; date: string; time: string; minutes: number; title: string };

function heading(items: ChangeItem[]): string {
  if (items.every((i) => i.kind === "delete")) return "予定を削除しました";
  if (items.every((i) => i.kind === "create")) return "AIがスケジュールを作成しました";
  return "AIがスケジュールを調整しました";
}

function toRow(item: ChangeItem, tz: string): Row {
  const start = new Date(item.start);
  return {
    key: item.id,
    id: item.id,
    date: localDateString(start, tz),
    time: localTime(start, tz),
    minutes: minutesBetween(start, new Date(item.end)),
    title: item.title,
  };
}

function rowStartIso(row: Row, tz: string): string {
  const [h, m] = row.time.split(":").map(Number);
  return zonedToUtc(row.date, h, m, tz).toISOString();
}

/** 編集前と比べて、サーバーに送る変更（追加・変更・削除）を作る */
function diff(original: ChangeItem[], rows: Row[], tz: string): ManualChange[] {
  const changes: ManualChange[] = [];
  const kept = new Set(rows.map((r) => r.id).filter(Boolean));
  for (const item of original) if (!kept.has(item.id)) changes.push({ op: "delete", id: item.id });
  for (const row of rows) {
    const start = rowStartIso(row, tz);
    const title = row.title.trim();
    if (!row.id) {
      changes.push({ op: "create", title, start, minutes: row.minutes });
      continue;
    }
    const before = original.find((i) => i.id === row.id)!;
    const sameStart = new Date(before.start).getTime() === new Date(start).getTime();
    const sameLength = minutesBetween(new Date(before.start), new Date(before.end)) === row.minutes;
    if (before.title !== title || !sameStart || !sameLength) {
      changes.push({ op: "update", id: row.id, title, start, minutes: row.minutes });
    }
  }
  return changes;
}

/** AI が変更した予定の一覧。［編集］で直せて、［スケジュールを確認］［元に戻す］もできる */
export default function ResultCard(props: {
  items: ChangeItem[];
  tz: string;
  undone?: boolean;
  onConfirm: () => void;
  onUndo: () => void;
  /** 手動編集を保存する。失敗したときはエラーメッセージを返す */
  onSave: (changes: ManualChange[]) => Promise<string | null>;
}) {
  const { items, tz, undone, onConfirm, onUndo, onSave } = props;
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  const editable = sorted.filter((i) => i.kind !== "delete");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setRows(editable.map((i) => toRow(i, tz)));
    setError(null);
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev!.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((prev) => {
      const list = prev!;
      // 最後の項目の直後に15分の項目を足す（項目がなければ今日の次の15分枠）
      const last = [...list].sort((a, b) => rowStartIso(a, tz).localeCompare(rowStartIso(b, tz))).at(-1);
      const base = last ? new Date(new Date(rowStartIso(last, tz)).getTime() + last.minutes * 60_000) : nextSlot();
      return [...list, { key: crypto.randomUUID(), date: localDateString(base, tz), time: localTime(base, tz), minutes: 15, title: "" }];
    });

  const save = async () => {
    if (!rows) return;
    if (rows.some((r) => !r.title.trim())) {
      setError("タイトルが空の項目があります");
      return;
    }
    const changes = diff(editable, rows, tz);
    if (changes.length === 0) {
      setRows(null);
      return;
    }
    setSaving(true);
    const message = await onSave(changes);
    setSaving(false);
    if (message) setError(message);
    else setRows(null);
  };

  if (rows) {
    return (
      <div className="rounded-2xl bg-surface p-4 shadow-card" data-testid="result-card-edit">
        <p className="font-bold">予定を編集</p>
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="space-y-2 rounded-xl border-l-[3px] border-l-blk-blue bg-surface-2 p-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={row.title}
                  onChange={(e) => update(row.key, { title: e.target.value })}
                  placeholder="タイトル"
                  aria-label="タイトル"
                  className="min-w-0 flex-1 rounded-lg bg-surface px-3 py-2 text-[16px] font-medium outline-none ring-1 ring-line focus:ring-accent"
                />
                <button
                  onClick={() => setRows((prev) => prev!.filter((r) => r.key !== row.key))}
                  aria-label="この項目を削除"
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-muted active:bg-surface"
                >
                  <TrashIcon className="size-5" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <select
                  value={row.time}
                  onChange={(e) => update(row.key, { time: e.target.value })}
                  aria-label="開始時刻"
                  className="rounded-lg bg-surface px-2 py-1.5 text-[16px] tabular-nums outline-none ring-1 ring-line focus:ring-accent"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <span className="text-muted">から</span>
                <select
                  value={row.minutes}
                  onChange={(e) => update(row.key, { minutes: Number(e.target.value) })}
                  aria-label="長さ"
                  className="rounded-lg bg-surface px-2 py-1.5 text-[16px] tabular-nums outline-none ring-1 ring-line focus:ring-accent"
                >
                  {(MINUTE_OPTIONS.includes(row.minutes) ? MINUTE_OPTIONS : [...MINUTE_OPTIONS, row.minutes].sort((a, b) => a - b)).map((m) => (
                    <option key={m} value={m}>
                      {m}分
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
        <button
          onClick={addRow}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-accent/40 py-2 text-sm font-bold text-accent"
        >
          <PlusIcon className="size-4" />
          項目を追加
        </button>
        {error && <p className="mt-2 text-sm text-now">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setRows(null)}
            disabled={saving}
            className="rounded-full border border-line bg-surface py-2.5 text-sm font-bold text-muted disabled:opacity-50"
          >
            キャンセル
          </button>
          <button onClick={save} disabled={saving} className="rounded-full bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-60">
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card" data-testid="result-card">
      <div className="flex items-center gap-2">
        <CheckCircleIcon className={`size-6 shrink-0 ${undone ? "text-muted" : "text-ok"}`} />
        <p className="flex-1 font-bold">{undone ? "変更を元に戻しました" : heading(items)}</p>
        {!undone && editable.length > 0 && (
          <button onClick={startEdit} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm font-bold text-accent active:bg-accent-soft">
            <PencilIcon className="size-4" />
            編集
          </button>
        )}
      </div>

      <ul className={`mt-3 space-y-1.5 ${undone ? "opacity-50" : ""}`}>
        {sorted.map((item) => {
          const start = new Date(item.start);
          const minutes = minutesBetween(start, new Date(item.end));
          return (
            <li key={item.id} className={`flex items-center gap-2 rounded-lg border-l-[3px] bg-surface-2 px-3 py-2 text-sm ${KIND_STYLE[item.kind]}`}>
              <span className="tabular-nums text-muted">{localTime(start, tz)}</span>
              <span className={`min-w-0 flex-1 truncate font-medium ${item.kind === "delete" ? "line-through" : ""}`}>{item.title}</span>
              <span className="shrink-0 text-xs text-muted">
                {minutes}分・{KIND_LABEL[item.kind]}
              </span>
            </li>
          );
        })}
      </ul>

      {!undone && (
        <div className="mt-4 space-y-2">
          <button onClick={onConfirm} className="w-full rounded-full bg-accent py-2.5 text-sm font-bold text-white transition active:scale-[0.99]">
            スケジュールを確認
          </button>
          <button
            onClick={onUndo}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-accent/40 bg-surface py-2.5 text-sm font-bold text-accent transition active:scale-[0.99]"
          >
            <UndoIcon className="size-4" />
            元に戻す
          </button>
        </div>
      )}
    </div>
  );
}

function nextSlot(): Date {
  const slot = 15 * 60_000;
  return new Date(Math.ceil(Date.now() / slot) * slot);
}
