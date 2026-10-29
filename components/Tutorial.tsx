"use client";

import { useState } from "react";
import { BellIcon, CalendarIcon, GaugeIcon, Mascot, RepeatIcon, SparkleIcon } from "./icons";
import { useTheme } from "./ThemeContext";

// 初めての人向けの使い方の説明。やさしい・ストイックで文と見た目を分ける。
// 最初に開いたときに1回だけ出す（この端末に保存）。マイページからもう一度見られる

type Step = { icon: React.ReactNode; label?: string; title: string; body: string };

const icon = (Icon: typeof CalendarIcon) => <Icon className="size-8" />;

const SOFT: Step[] = [
  {
    icon: <Mascot className="size-20" />,
    title: "ようこそ！",
    body: "AIスケジュールアシスタントは、ひと言送るだけで、空き時間に15分単位で予定を組み立てるアプリです。Googleカレンダーと連携しています。",
  },
  {
    icon: icon(CalendarIcon),
    title: "今日の予定がひと目でわかる",
    body: "ホームとカレンダーに、Googleカレンダーの予定が並びます。灰色はメインのカレンダーの予定で、アプリが変えることはありません。AIが入れる予定は、専用カレンダー「AIスケジューラー」に入ります。",
  },
  {
    icon: icon(SparkleIcon),
    title: "AIにひと言で頼む",
    body: "右下の ＋ か「AI」タブから、「14時から会議1時間」「明日の午前に資料作成2時間」のように送ってください。結果は［元に戻す］でいつでも取り消せて、［編集］で手直しもできます。",
  },
  {
    icon: icon(RepeatIcon),
    title: "毎日を、もっとラクに",
    body: "「15分延長」などのクイックボタンや、急な用事をすぐ入れる割り込みモードが使えます。睡眠や授業のような毎日のルーティンは、マイページから登録できます。",
  },
  {
    icon: icon(BellIcon),
    title: "使用量と通知",
    body: "AIの使用量には1日の上限があります。節約モードなら、決まった形の依頼はAIを使わずに処理します。予定の通知は、Googleカレンダーの設定で受け取れます（マイページの「予定の通知」で方法を説明しています）。",
  },
];

const STOIC: Step[] = [
  {
    icon: icon(GaugeIcon),
    label: "WELCOME",
    title: "15分を制する者が、1日を制する。",
    body: "やることを投げれば、AI コーチが空き時間に15分単位で組み込む。予定は Google カレンダーと連携する。",
  },
  {
    icon: icon(CalendarIcon),
    label: "TODAY",
    title: "予定は、ブロックで見よう。",
    body: "ホームとカレンダーに Google カレンダーの予定が並ぶ。MAIN はメインのカレンダーの予定で、アプリは動かさない。AI の予定は専用カレンダー「AIスケジューラー」に入る。",
  },
  {
    icon: icon(GaugeIcon),
    label: "COACH",
    title: "迷ったら、投げよう。",
    body: "コーチのタブで「14時から会議1時間」のように送る。気に入らなければ［元に戻す］。［編集］で手直しもできる。",
  },
  {
    icon: icon(RepeatIcon),
    label: "ARC",
    title: "挑戦を、数字で追おう。",
    body: "ホームに挑戦の日数（WINTER ARC  DAY 31 / 92 など）が出る。期間はマイページで変えられる。最大モードなら、直近2週間の時間の浪費も洗い出す。",
  },
  {
    icon: icon(BellIcon),
    label: "RULES",
    title: "AI を、無駄撃ちしない。",
    body: "AI の使用量には1日の上限がある。節約モードなら、決まった形の依頼は AI を使わずに処理する。予定の通知は Google カレンダーの設定で受け取ろう（マイページの「予定の通知」）。",
  },
];

export default function Tutorial({ onClose }: { onClose: () => void }) {
  const stoic = useTheme().theme === "stoic";
  const steps = stoic ? STOIC : SOFT;
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-dvh flex flex-col bg-bg pt-[env(safe-area-inset-top)]" role="dialog" aria-modal="true" aria-label="使い方" data-testid="tutorial">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="flex justify-end pt-4">
          {!last && (
            <button onClick={onClose} className="px-2 py-1 text-sm text-muted" data-testid="tutorial-skip">
              {stoic ? "SKIP" : "スキップ"}
            </button>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-center gap-6" key={i}>
          <div className={`grid size-24 place-items-center ${stoic ? "rounded-2xl bg-surface text-accent-ink shadow-card" : "rounded-3xl bg-accent-soft text-accent-ink"} ${i === 0 && !stoic ? "bg-transparent" : ""}`}>
            {step.icon}
          </div>
          <div className="space-y-3">
            {step.label && <p className="t-label text-accent-ink">{step.label}</p>}
            <h2 className={stoic ? "t-num text-[30px] font-bold leading-tight tracking-[-0.02em] text-heading" : "text-2xl font-bold leading-snug text-heading"}>
              {step.title}
            </h2>
            <p className="text-[15px] leading-relaxed text-text stoic:text-muted">{step.body}</p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex justify-center gap-2" aria-hidden="true">
            {steps.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all ${n === i ? "w-6 bg-accent" : "w-1.5 bg-line"} stoic:rounded-sm`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <button
                onClick={() => setI(i - 1)}
                className="rounded-full border border-line px-5 py-3 text-sm font-bold text-muted stoic:rounded-xl"
              >
                {stoic ? "BACK" : "戻る"}
              </button>
            )}
            <button
              onClick={() => (last ? onClose() : setI(i + 1))}
              className="flex-1 rounded-full bg-accent py-3 text-sm font-bold text-on-accent stoic:rounded-xl stoic:t-num stoic:tracking-[0.08em]"
              data-testid="tutorial-next"
            >
              {last ? (stoic ? "始める" : "はじめる") : stoic ? "NEXT" : "次へ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
