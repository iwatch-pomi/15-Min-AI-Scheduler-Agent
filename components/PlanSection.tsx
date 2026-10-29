"use client";

import { useEffect, useState } from "react";
import { PLANS, PLAN_IDS, bestValuePlan, briefCostPercent, priceLabel, yenPerChat, type PaidPlan, type Plan } from "@/lib/plans";
import { CheckIcon, LockIcon, SparkleIcon } from "./icons";
import { useTheme } from "./ThemeContext";

type BillingInfo = { plan: Plan; status: string | null; renewsAt: string | null; customer: boolean; available: boolean };

const MODE_NAMES: Record<string, string> = { save: "節約", normal: "通常", boost: "強化", max: "最大" };

/** マイページの「プラン」：今のプラン、3つのプランの違い、申し込み・管理の画面（Stripe）へのボタン */
export default function PlanSection(props: { plan: Plan; demo?: boolean }) {
  const { demo } = props;
  const stoic = useTheme().theme === "stoic";
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plan = info?.plan ?? props.plan;

  useEffect(() => {
    fetch("/api/billing", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: BillingInfo | null) => data && setInfo(data))
      .catch(() => {});
  }, [props.plan]);

  // Stripe の画面へ移る（URL はサーバーで作る。カードの情報はこのアプリには届かない）
  const go = async (path: string, body: object, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.url !== "string") {
        setError(data.error ?? "お支払いの画面を開けませんでした");
        setBusy(null);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("通信に失敗しました");
      setBusy(null);
    }
  };
  const upgrade = (p: PaidPlan) => go("/api/billing/checkout", { plan: p }, p);
  const manage = () => go("/api/billing/portal", {}, "portal");

  const renews = info?.renewsAt ? new Date(info.renewsAt).toLocaleDateString("ja-JP", { month: "long", day: "numeric" }) : null;
  const unavailable = demo || (info !== null && !info.available);

  return (
    <div className="space-y-3 px-4 py-3" data-testid="plan-section">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">今のプラン</span>
        <span className="t-num text-lg font-bold text-accent-ink" data-testid="current-plan">
          {PLANS[plan].label}
          {stoic && <span className="ml-1.5 text-xs tracking-[0.12em] text-muted">{PLANS[plan].en}</span>}
        </span>
      </div>
      {plan !== "free" && renews && (
        <p className="text-xs text-muted">
          {info?.status === "canceling" ? `解約済み。${renews}まで今のプランを使えます` : info?.status === "past_due" ? "お支払いが確認できていません。カードを確かめてください" : `次の更新日：${renews}`}
        </p>
      )}

      <ul className="space-y-2">
        {PLAN_IDS.map((p) => {
          const rule = PLANS[p];
          const current = p === plan;
          const higher = PLAN_IDS.indexOf(p) > PLAN_IDS.indexOf(plan);
          const perChat = yenPerChat(p);
          return (
            <li
              key={p}
              className={`rounded-xl border px-3 py-2.5 stoic:rounded-[10px] ${
                current ? "border-accent bg-accent-soft" : rule.recommended ? "border-2 border-accent" : "border-line-soft"
              }`}
              data-testid={`plan-${p}`}
            >
              {rule.recommended && !current && (
                <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-accent-ink" data-testid="plan-recommended">
                  <SparkleIcon className="size-3.5" />
                  {stoic ? "RECOMMENDED・おすすめ" : "おすすめ"}
                </p>
              )}
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-heading">
                  {rule.label}
                  {stoic && <span className="ml-1 text-[10px] font-normal tracking-[0.12em] text-muted">{rule.en}</span>}
                </span>
                <span className="t-code text-xs text-muted">{priceLabel(p)}</span>
                {current && <span className="ml-auto text-[11px] font-bold text-accent-ink">利用中</span>}
              </div>
              <p className="mt-0.5 text-xs text-muted">{rule.tagline}</p>
              {perChat !== null && (
                <p className={`mt-0.5 text-[11px] ${p === bestValuePlan() ? "font-bold text-accent-ink" : "text-muted"}`} data-testid={`per-chat-${p}`}>
                  AI 1回あたり約{perChat}円{p === bestValuePlan() ? "（広告なしでいちばんお得）" : ""}
                </p>
              )}
              <ul className="mt-1.5 space-y-0.5 text-xs">
                <li className="flex items-center gap-1.5">
                  <CheckIcon className="size-3.5 text-accent-ink" />
                  AIの目安：{rule.guide}
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckIcon className="size-3.5 text-accent-ink" />
                  モード：{rule.modes.map((m) => MODE_NAMES[m]).join("・")}
                </li>
                <Feature ok={rule.briefsPerDay === null}>
                  {rule.briefsPerDay === 0
                    ? "AIで更新（AIブリーフ）：使えない"
                    : rule.briefsPerDay !== null
                      ? `AIで更新（AIブリーフ）：1日${rule.briefsPerDay}回まで（1回で今日のAIの約${briefCostPercent(p)}%）`
                      : "AIで更新（AIブリーフ）：回数の制限なし"}
                </Feature>
                <Feature ok={rule.customInstructions}>{rule.customInstructions ? "AIへのカスタム指示：使える" : "AIへのカスタム指示：使えない"}</Feature>
                <Feature ok={rule.ads === "none"}>{{ full: "広告：多め（全画面の広告あり）", light: "広告：少なめ（ホームだけ）", none: "広告なし" }[rule.ads]}</Feature>
              </ul>
              {higher && (
                <button
                  onClick={() => upgrade(p as PaidPlan)}
                  disabled={busy !== null || unavailable}
                  className="mt-2 w-full rounded-full bg-accent py-2 text-sm font-bold text-on-accent disabled:opacity-50 stoic:h-10 stoic:rounded-[10px] stoic:py-0"
                  data-testid={`upgrade-${p}`}
                >
                  {busy === p ? "開いています…" : `${rule.label}${plan === "free" ? "にする" : "に変更"}（${priceLabel(p)}）`}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {plan !== "free" || info?.customer ? (
        <button
          onClick={manage}
          disabled={busy !== null || unavailable}
          className="w-full rounded-full border border-accent/40 py-2 text-sm font-bold text-accent-ink disabled:opacity-50 stoic:h-11 stoic:rounded-xl stoic:border-line stoic:py-0 stoic:text-heading"
          data-testid="manage-billing"
        >
          {busy === "portal" ? "開いています…" : "お支払い・プランの変更・解約"}
        </button>
      ) : null}
      {error && <p className="text-xs text-now">{error}</p>}
      <p className="text-[11px] leading-relaxed text-muted">
        {demo
          ? "デモでは、お支払いは使えません。"
          : unavailable
            ? "有料プランは準備中です。もうしばらくお待ちください。"
            : "お支払いは Stripe の画面で行います（カードの情報はこのアプリには届きません）。毎月自動で更新され、いつでも解約できます。解約しても、支払い済みの期間の終わりまで使えます。"}
        {" "}AIの上限は、今日の分は毎日0時に、月の分は毎月1日に戻ります。
      </p>
    </div>
  );
}

/** プランの比較の1行。ok なら印、だめなら鍵 */
function Feature({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      {ok ? <CheckIcon className="size-3.5 shrink-0 text-accent-ink" /> : <LockIcon className="size-3.5 shrink-0 text-muted" />}
      {children}
    </li>
  );
}
