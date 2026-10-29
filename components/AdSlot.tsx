"use client";

import { PLANS, firstPlanWith, type Plan } from "@/lib/plans";
import { SparkleIcon } from "./icons";
import { useTheme } from "./ThemeContext";

/**
 * 小さい広告の枠（無料はホームと AI 画面、ライトはホームだけ）。今は自前の案内を出す。
 * 広告の事業者（AdSense など）を決めたら、この中身だけを差し替え、proxy.ts の CSP にそのドメインを足す。
 * 広告の文字・リンクは、予定の情報（AI に渡す文脈）には混ぜない
 */
export default function AdSlot(props: { plan: Plan; onOpenPlans: () => void; place: "home" | "chat" }) {
  const stoic = useTheme().theme === "stoic";
  // 広告が少なめのプラン（ライト）は、ホームだけに出す
  const ads = PLANS[props.plan].ads;
  if (ads === "none" || (ads === "light" && props.place !== "home")) return null;
  return (
    <aside aria-label="広告" className={props.place === "chat" ? "px-4 pt-2" : "mt-6"} data-testid="ad-slot">
      <button
        onClick={props.onOpenPlans}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-4 py-2.5 text-left stoic:rounded-[12px]"
      >
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted stoic:t-label">{stoic ? "AD" : "広告"}</span>
        <span className="min-w-0 flex-1 text-xs leading-relaxed">
          {/* プラン（購入）の案内なので、ストイックでも丁寧語にする */}
          {ads === "light" ? `${adFree()}以上なら広告なし。AIももっと使えます` : "有料プランなら広告が減り、AIももっと使えます"}
        </span>
        <SparkleIcon className="size-4 shrink-0 text-accent-ink" />
      </button>
    </aside>
  );
}

/** 広告なしになる、いちばん安いプランの名前 */
const adFree = () => PLANS[firstPlanWith((r) => r.ads === "none")].label;
