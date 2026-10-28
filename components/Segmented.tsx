"use client";

/** 2〜3個から1つを選ぶボタン（割り込みモードの設定・強化／節約の切り替え） */
export default function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testId?: string;
}) {
  const { label, value, options, onChange, testId } = props;
  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label={label} data-testid={testId}>
      <span className="w-16 shrink-0 text-[11px] text-muted">{label}</span>
      <div className="flex flex-1 rounded-full bg-surface-2 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-full px-2 py-1 text-xs font-bold transition ${
              o.value === value ? "bg-surface text-accent-ink shadow-card" : "text-muted"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
