"use client";

import { LockIcon } from "./icons";

/** 2〜3個から1つを選ぶボタン（割り込みモードの設定・強化／節約・デザインの切り替え） */
export default function Segmented<T extends string>(props: {
  label: string;
  value: T;
  /** locked は今のプランでは選べない（鍵の印を付け、押すと onLocked を呼ぶ） */
  options: { value: T; label: string; locked?: boolean }[];
  onChange: (v: T) => void;
  onLocked?: (v: T) => void;
  testId?: string;
  /** マイページ用の大きいボタン（見出しは画面に出さない） */
  large?: boolean;
}) {
  const { label, value, options, onChange, onLocked, testId, large } = props;
  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label={label} data-testid={testId}>
      {!large && <span className="w-16 shrink-0 text-[11px] text-muted">{label}</span>}
      <div
        className={`flex flex-1 rounded-full bg-surface-2 p-0.5 stoic:gap-1 stoic:rounded-[10px] stoic:border stoic:border-line-soft stoic:bg-bg ${
          large ? "p-1 stoic:rounded-xl" : ""
        }`}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={o.locked || undefined}
              onClick={() => (o.locked ? onLocked?.(o.value) : onChange(o.value))}
              className={`flex-1 whitespace-pre-line rounded-full px-1 font-bold leading-tight transition stoic:rounded-[7px] ${large ? "py-2 text-sm stoic:min-h-10 stoic:rounded-[9px] stoic:py-1.5 stoic:t-num stoic:text-[13px] stoic:tracking-[0.04em]" : "py-1 text-xs"} ${
                on ? "bg-surface text-accent-ink shadow-card stoic:bg-accent stoic:text-on-accent stoic:shadow-none" : "text-muted"
              } ${o.locked ? "opacity-60" : ""}`}
              data-locked={o.locked || undefined}
            >
              {o.locked && <LockIcon className="mr-0.5 inline size-3 align-[-1px]" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
