"use client";

import { logout } from "@/app/actions";
import { AppLogo, CalendarIcon, ClockIcon, ShareIcon, SparkleIcon, UserIcon } from "./icons";

export default function SettingsView(props: { tz: string; email?: string; demo?: boolean; dailyLimit: number }) {
  const { tz, email, demo, dailyLimit } = props;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <header className="pt-4 pb-3">
        <h1 className="text-2xl font-bold">設定</h1>
      </header>

      <div className="space-y-4">
        <Section title="アカウント">
          <Row icon={<UserIcon className="size-5" />} label={demo ? "デモモード" : "ログイン中"} value={demo ? "ログインなし" : (email ?? "")} />
          {!demo && (
            <form action={logout} className="px-4 py-3">
              <button type="submit" className="w-full rounded-full border border-now/40 py-2 text-sm font-bold text-now">
                ログアウト
              </button>
            </form>
          )}
        </Section>

        <Section title="スケジュール">
          <Row icon={<ClockIcon className="size-5" />} label="タイムゾーン" value={tz} />
          <Row icon={<SparkleIcon className="size-5" />} label="AIの利用上限" value={`1日${dailyLimit}回まで`} />
          <Row icon={<CalendarIcon className="size-5" />} label="AIの予定の保存先" value="15分スケジューラー" />
          <p className="px-4 py-3 text-xs text-muted">
            AI の予定は、Google カレンダーに自動で作られる専用カレンダー「15分スケジューラー」に入ります。メインのカレンダーは読むだけで、変更しません。色や表示の切り替えは Google カレンダーの設定から変えられます。
          </p>
        </Section>

        <Section title="ホーム画面に追加（iPhone）">
          <ol className="space-y-2 px-4 py-3 text-sm">
            <li>1. Safari でこのページを開く</li>
            <li className="flex items-center gap-1">
              2. 画面下の共有ボタン <ShareIcon className="inline size-4 text-accent" /> をタップ
            </li>
            <li>3.「ホーム画面に追加」を選ぶ</li>
          </ol>
          <p className="px-4 pb-3 text-xs text-muted">ホーム画面のアイコンから、アプリのように全画面で開けます。</p>
        </Section>

        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted">
          <AppLogo className="size-5 rounded-md" />
          15-Min AI Scheduler
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-xs font-bold text-muted">{title}</h2>
      <div className="divide-y divide-line-soft overflow-hidden rounded-2xl bg-surface shadow-card">{children}</div>
    </section>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-accent">{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      <span className="min-w-0 truncate text-sm text-muted">{value}</span>
    </div>
  );
}
