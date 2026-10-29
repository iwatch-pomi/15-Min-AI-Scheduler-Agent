"use client";

import { PLANS, type Plan } from "@/lib/plans";
import { SparkleIcon } from "./icons";
import { useTheme } from "./ThemeContext";

/**
 * 広告の枠（無料プランだけに出す）。今は自前の案内を出す。
 * 広告の事業者（AdSense など）を決めたら、この中身だけを差し替え、proxy.ts の CSP にそのドメインを足す。
 * 広告の文字・リンクは、予定の情報（AI に渡す文脈）には混ぜない
 */
export default function AdSlot(props: { plan: Plan; onOpenPlans: () => void; place: "home" | "chat" }) {
  const stoic = useTheme().theme === "stoic";
  if (!PLANS[props.plan].ads) return null;
  return (
    <aside aria-label="広告" className={props.place === "chat" ? "px-4 pt-2" : "mt-6"} data-testid="ad-slot">
      <button
        onClick={props.onOpenPlans}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-4 py-2.5 text-left stoic:rounded-[12px]"
      >
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted stoic:t-label">{stoic ? "AD" : "広告"}</span>
        <span className="min-w-0 flex-1 text-xs leading-relaxed">
          {stoic ? "有料プランで広告を消せ。AIの上限も上がる。" : "有料プランなら広告なし。AIももっと使えます"}
        </span>
        <SparkleIcon className="size-4 shrink-0 text-accent-ink" />
      </button>
    </aside>
  );
}
