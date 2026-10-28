"use client";

import { localTime, minutesBetween } from "@/lib/time";
import type { ChangeItem } from "@/lib/ui";
import { CheckCircleIcon, UndoIcon } from "./icons";

const KIND_LABEL: Record<ChangeItem["kind"], string> = { create: "追加", update: "変更", delete: "削除" };
const KIND_STYLE: Record<ChangeItem["kind"], string> = {
  create: "border-l-blk-blue",
  update: "border-l-blk-orange",
  delete: "border-l-blk-gray",
};

function heading(items: ChangeItem[]): string {
  if (items.every((i) => i.kind === "delete")) return "予定を削除しました";
  if (items.every((i) => i.kind === "create")) return "AIがスケジュールを作成しました";
  return "AIがスケジュールを調整しました";
}

/** AI が変更した予定の一覧と［スケジュールを確認］［元に戻す］ */
export default function ResultCard(props: {
  items: ChangeItem[];
  tz: string;
  undone?: boolean;
  onConfirm: () => void;
  onUndo: () => void;
}) {
  const { items, tz, undone, onConfirm, onUndo } = props;
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card" data-testid="result-card">
      <div className="flex items-center gap-2">
        <CheckCircleIcon className={`size-6 ${undone ? "text-muted" : "text-ok"}`} />
        <p className="font-bold">{undone ? "変更を元に戻しました" : heading(items)}</p>
      </div>

      <ul className={`mt-3 space-y-1.5 ${undone ? "opacity-50" : ""}`}>
        {sorted.map((item, i) => {
          const start = new Date(item.start);
          const minutes = minutesBetween(start, new Date(item.end));
          return (
            <li key={i} className={`flex items-center gap-2 rounded-lg border-l-[3px] bg-surface-2 px-3 py-2 text-sm ${KIND_STYLE[item.kind]}`}>
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
