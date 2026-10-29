"use client";

import { useTheme } from "./ThemeContext";

// 予定の通知は Google カレンダーが出す。AI の予定は「AIスケジューラー」の「デフォルトの通知」に従うので、
// その設定のしかたを説明する（このアプリからは設定しない）

const STEPS = {
  phone: [
    "Google カレンダーのアプリを開く（このアプリと同じ Google アカウントでログインしておく）",
    "左上の ≡（メニュー）→「設定」を開く",
    "アカウントの下に並ぶカレンダーから「AIスケジューラー」を選ぶ",
    "「デフォルトの通知」（または「既定の通知」）→ 通知を追加し、「予定の開始時」や「5分前」を選ぶ",
  ],
  pc: [
    "calendar.google.com を開く",
    "左の「マイカレンダー」で「AIスケジューラー」にカーソルを合わせ、︙ →「設定と共有」",
    "「イベントの通知」→「通知を追加」で、「通知」「5分」など好きな時間にする",
  ],
};

/** マイページから開く「予定の通知（Googleカレンダー）」の説明 */
export default function NotifyGuide({ onClose }: { onClose: () => void }) {
  const stoic = useTheme().theme === "stoic";
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-dvh flex items-end justify-center bg-black/30 stoic:bg-black/50" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-3xl bg-bg px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-card stoic:border-t stoic:border-line"
        onClick={(e) => e.stopPropagation()}
        data-testid="notify-guide"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-heading">予定の通知を受け取る</h2>
          <button onClick={onClose} className="text-sm text-muted">
            閉じる
          </button>
        </div>
        <p className="text-sm leading-relaxed">
          {stoic
            ? "通知は Google カレンダーが出す。AI の予定は専用カレンダー「AIスケジューラー」に入るので、そこに通知を設定しておこう。一度決めれば、これから入る予定にもすでに入っている予定にも効く。"
            : "通知は Google カレンダーから届きます。AI の予定は専用カレンダー「AIスケジューラー」に入るので、そのカレンダーに通知を設定しておくと、これから入る予定にも、すでに入っている予定にも通知が届きます。"}
        </p>

        <Block title="スマホ（Google カレンダーのアプリ）" steps={STEPS.phone} />
        <Block title="パソコン（ブラウザ）" steps={STEPS.pc} />

        <div className="space-y-1.5 rounded-xl bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-muted">
          <p>・ iPhone は「設定」→「通知」→「Google カレンダー」で、通知を許可しておく。</p>
          <p>・ メインのカレンダーの予定の通知も、同じ手順でそのカレンダーを選べば変えられる。</p>
          <p>・ iPhone の標準の「カレンダー」アプリで Google の予定を見ている場合は、そのアプリの通知の設定が使われることがある。</p>
          <p>・ 項目の名前は、アプリの版や端末によって少し違うことがある。</p>
        </div>
      </div>
    </div>
  );
}

function Block({ title, steps }: { title: string; steps: string[] }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-card">
      <h3 className="mb-2 text-sm font-bold text-accent-ink stoic:t-label stoic:text-[11px]">{title}</h3>
      <ol className="space-y-2 text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="t-num w-4 shrink-0 font-bold text-accent-ink">{i + 1}</span>
            <span className="leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
