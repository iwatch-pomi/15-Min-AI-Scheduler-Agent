"use client";

import { useState } from "react";
import { logout } from "@/app/actions";
import type { Usage } from "@/lib/limits";
import { daysLabel, type Routine, type RoutineInput } from "@/lib/routines";
import RoutineEditor from "./RoutineEditor";
import UsageMeter from "./UsageMeter";
import { AppLogo, CalendarIcon, ChevronRightIcon, ClockIcon, PlusIcon, RepeatIcon, ShareIcon, UserIcon } from "./icons";

export default function SettingsView(props: {
  tz: string;
  email?: string;
  demo?: boolean;
  usage: Usage;
  onClearHistory: () => Promise<boolean | void>;
  routines: Routine[] | null;
  onSaveRoutine: (id: string | null, input: RoutineInput) => Promise<string | null>;
  onDeleteRoutine: (id: string) => Promise<string | null>;
}) {
  const { tz, email, demo, usage, onClearHistory, routines, onSaveRoutine, onDeleteRoutine } = props;
  // 編集中のルーティン（"new" は追加）
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  const [cleared, setCleared] = useState(false);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <header className="pt-4 pb-3">
        <h1 className="text-2xl font-bold text-heading">マイページ</h1>
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

        <Section title="毎日のルーティン">
          {routines === null ? (
            <p className="px-4 py-3 text-sm text-muted">読み込み中…</p>
          ) : routines.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted">朝の準備・ジム・日記など、毎日（決まった曜日に）くり返す予定を登録すると、カレンダーに自動で入ります。</p>
          ) : (
            routines.map((r) => (
              <button key={r.id} onClick={() => setEditing(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2" data-testid="routine-row">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                  <RepeatIcon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-heading">{r.title}</span>
                  <span className="block text-xs text-muted tabular-nums">
                    {r.time}〜{endTime(r)}・{daysLabel(r.days)}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted" />
              </button>
            ))
          )}
          <button onClick={() => setEditing("new")} className="flex w-full items-center justify-center gap-1 px-4 py-3 text-sm font-bold text-accent-ink active:bg-surface-2">
            <PlusIcon className="size-4" />
            ルーティンを追加
          </button>
        </Section>
        {editing && (
          <RoutineEditor
            routine={editing === "new" ? null : editing}
            onSave={(input) => onSaveRoutine(editing === "new" ? null : editing.id, input)}
            onDelete={editing === "new" ? undefined : () => onDeleteRoutine(editing.id)}
            onClose={() => setEditing(null)}
          />
        )}

        <Section title="スケジュール">
          <Row icon={<ClockIcon className="size-5" />} label="タイムゾーン" value={tz} />
          <div className="px-4 py-3">
            <UsageMeter usage={usage} />
          </div>
          <Row icon={<CalendarIcon className="size-5" />} label="AIの予定の保存先" value="AIスケジューラー" />
          <p className="px-4 py-3 text-xs text-muted">
            AI の予定は、Google カレンダーに自動で作られる専用カレンダー「AIスケジューラー」に入ります。メインのカレンダーは読むだけで、変更しません。色や表示の切り替えは Google カレンダーの設定から変えられます。
          </p>
        </Section>

        <Section title="AIとのチャット">
          <div className="space-y-2 px-4 py-3">
            <p className="text-xs text-muted">AIとのチャットは保存され、AI画面でいつでも見返せます。消してもカレンダーの予定はそのままです。</p>
            <button
              onClick={async () => {
                if (!window.confirm("AIとのチャット履歴をすべて削除しますか？（カレンダーの予定は消えません）")) return;
                if (await onClearHistory()) setCleared(true);
              }}
              className="w-full rounded-full border border-now/40 py-2 text-sm font-bold text-now"
            >
              {cleared ? "削除しました" : "チャット履歴を削除"}
            </button>
          </div>
        </Section>

        <Section title="ホーム画面に追加（iPhone）">
          <ol className="space-y-2 px-4 py-3 text-sm">
            <li>1. Safari でこのページを開く</li>
            <li className="flex items-center gap-1">
              2. 画面下の共有ボタン <ShareIcon className="inline size-4 text-accent-ink" /> をタップ
            </li>
            <li>3.「ホーム画面に追加」を選ぶ</li>
          </ol>
          <p className="px-4 pb-3 text-xs text-muted">ホーム画面のアイコンから、アプリのように全画面で開けます。</p>
        </Section>

        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted">
          <AppLogo className="size-5 rounded-md" />
          AIスケジュールアシスタント
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
      <span className="text-accent-ink">{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      <span className="min-w-0 truncate text-sm text-muted">{value}</span>
    </div>
  );
}

function endTime(r: Routine): string {
  const [h, m] = r.time.split(":").map(Number);
  const total = (h * 60 + m + r.minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
