"use client";

import { useEffect, useState } from "react";
import { PLANS, firstPlanWith } from "@/lib/plans";
import { SparkleIcon } from "./icons";

/** 閉じるボタンが出るまでの秒数 */
export const INTERSTITIAL_WAIT_SECONDS = 5;

/**
 * 全画面広告（無料プランだけ）。今は自前の案内を出す。
 * 広告の事業者に替えるときの注意：AdSense は、自分で作った全画面の枠（オーバーレイ）に広告を入れることを禁止している。
 * 全画面にするなら、Google Ad Manager の Web インタースティシャルなど、全画面を認めている形式を使い、proxy.ts の CSP にドメインを足す
 */
export default function Interstitial(props: { onClose: () => void; onOpenPlans: () => void }) {
  const [left, setLeft] = useState(INTERSTITIAL_WAIT_SECONDS);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const lite = PLANS[firstPlanWith((r) => r.ads !== "full")];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="広告"
      className="fixed inset-x-0 top-0 z-[60] flex h-dvh flex-col bg-bg px-6 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+24px)]"
      data-testid="interstitial"
    >
      <div className="flex items-center justify-between">
        <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted stoic:t-label">広告</span>
        {left > 0 ? (
          <span className="t-num text-xs text-muted" data-testid="interstitial-wait">
            {left}秒後に閉じられます
          </span>
        ) : (
          <button onClick={props.onClose} className="rounded-full border border-line px-4 py-1.5 text-sm font-bold text-heading stoic:rounded-[10px]" data-testid="interstitial-close">
            閉じる ✕
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <SparkleIcon className="size-14 text-accent-ink" />
        <p className="t-num text-2xl font-bold leading-snug text-heading">
          {/* プラン（購入）の案内なので、ストイックでも丁寧語にする */}
          有料プランなら
          <br />
          この広告は出ません
        </p>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          {lite.label}（{lite.priceYen.toLocaleString("ja-JP")}円/月）から、全画面の広告がなくなり、AIの上限も上がります。
        </p>
        <button
          onClick={props.onOpenPlans}
          className="w-full max-w-xs rounded-full bg-accent py-3 font-bold text-on-accent stoic:rounded-xl"
          data-testid="interstitial-plans"
        >
          プランを見る
        </button>
      </div>
    </div>
  );
}
