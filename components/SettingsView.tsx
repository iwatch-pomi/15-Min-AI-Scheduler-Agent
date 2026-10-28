"use client";

import { useState } from "react";
import { logout } from "@/app/actions";
import { AI_MODE_HELP, SAVE_TIP, type AiMode } from "@/lib/interrupt";
import type { Usage } from "@/lib/limits";
import type { Routine, RoutineInput } from "@/lib/routines";
import { arcProgress, type Arc, type Theme } from "@/lib/theme";
import ArcEditor from "./ArcEditor";
import RoutineList from "./RoutineList";
import Segmented from "./Segmented";
import UsageMeter from "./UsageMeter";
import { AppLogo, CalendarIcon, ChevronRightIcon, ClockIcon, GaugeIcon, RepeatIcon, ShareIcon, SparkleIcon, UserIcon } from "./icons";
import { useTheme } from "./ThemeContext";

export default function SettingsView(props: {
  tz: string;
  email?: string;
  demo?: boolean;
  usage: Usage;
  onClearHistory: () => Promise<boolean | void>;
  routines: Routine[] | null;
  onSaveRoutine: (id: string | null, input: RoutineInput) => Promise<string | null>;
  onDeleteRoutine: (id: string) => Promise<string | null>;
  aiMode: AiMode;
  onAiModeChange: (m: AiMode) => void;
  today: string;
  onThemeChange: (t: Theme) => void;
  /** 挑戦の名前と期間。null は初期値に戻す */
  onArcChange: (arc: Arc | null) => void;
}) {
  const { tz, email, demo, usage, onClearHistory, routines, onSaveRoutine, onDeleteRoutine, aiMode, onAiModeChange, today, onThemeChange, onArcChange } = props;
  const { theme, arc } = useTheme();
  const stoic = theme === "stoic";
  const [editingArc, setEditingArc] = useState(false);
  // 見出しは、ストイックでは英語の小見出しにする
  const t = (soft: string, en: string) => (stoic ? en : soft);
  // マイページの中で開いている画面（ルーティンの一覧は別の画面にまとめる）
  const [page, setPage] = useState<"main" | "routines">("main");
  const [cleared, setCleared] = useState(false);

  if (page === "routines") {
    return <RoutineList routines={routines} onSave={onSaveRoutine} onDelete={onDeleteRoutine} onBack={() => setPage("main")} />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      {stoic ? (
        <header className="pt-8 pb-5">
          <p className="t-label text-muted">PROFILE</p>
          <h1 className="t-num mt-1 text-[34px] font-bold tracking-[-0.02em] text-heading">マイページ</h1>
        </header>
      ) : (
        <header className="pt-4 pb-3">
          <h1 className="text-2xl font-bold text-heading">マイページ</h1>
        </header>
      )}

      <div className="space-y-4 stoic:space-y-7">
        <Section title={t("アカウント", "ACCOUNT")}>
          <Row icon={<UserIcon className="size-5" />} label={demo ? "デモモード" : "ログイン中"} value={demo ? "ログインなし" : (email ?? "")} />
          {!demo && (
            <form action={logout} className="px-4 py-3">
              <button type="submit" className="w-full rounded-full border border-now/40 py-2 text-sm font-bold text-now stoic:h-11 stoic:rounded-xl stoic:border-[#3a2422] stoic:py-0">
                ログアウト
              </button>
            </form>
          )}
        </Section>

        <Section title={t("デザイン", "DESIGN")}>
          <div className="space-y-2 px-4 py-3">
            <Segmented
              label="デザイン"
              large
              value={theme}
              options={[
                { value: "soft", label: stoic ? "やさしい SOFT" : "やさしい" },
                { value: "stoic", label: stoic ? "ストイック ARC" : "ストイック" },
              ]}
              onChange={onThemeChange}
              testId="theme-switch"
            />
            <p className="text-xs leading-relaxed text-muted">
              {stoic
                ? "黒と水色の、打ち込む人のための画面。ホームに挑戦の進み具合と、時間帯のひと言が出ます。"
                : "「ストイック」は、Winter Arc など目標に打ち込む人向けの、黒を基調にした画面です。"}
            </p>
          </div>
          {stoic && arc && (
            <button onClick={() => setEditingArc(true)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2" data-testid="arc-link">
              <GaugeIcon className="size-5 shrink-0 text-accent-ink" strokeWidth={2} />
              <span className="flex-1 text-sm">挑戦</span>
              <span className="t-code min-w-0 truncate text-xs text-muted">
                {arc.name} · {arcProgress(arc, today).total}日
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted" />
            </button>
          )}
        </Section>
        {editingArc && arc && (
          <ArcEditor
            arc={arc}
            today={today}
            onSave={(a) => {
              onArcChange(a);
              setEditingArc(false);
            }}
            onReset={() => {
              onArcChange(null);
              setEditingArc(false);
            }}
            onClose={() => setEditingArc(false)}
          />
        )}

        <Section title={t("スケジュール", "SCHEDULE")}>
          <button onClick={() => setPage("routines")} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2" data-testid="routines-link">
            <span className="text-accent-ink">
              <RepeatIcon className="size-5" />
            </span>
            <span className="flex-1 text-sm">毎日のルーティン</span>
            <span className="t-code text-sm text-muted tabular-nums stoic:text-xs">
              {routines === null ? "" : routines.length ? (stoic ? `${routines.length} BLOCKS` : `${routines.length}件`) : "未登録"}
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-muted" />
          </button>
          <Row icon={<ClockIcon className="size-5" />} label="タイムゾーン" value={tz} />
          <Row icon={<CalendarIcon className="size-5" />} label="AIの予定の保存先" value="AIスケジューラー" />
          <p className="px-4 py-3 text-xs text-muted">
            AI の予定は、Google カレンダーに自動で作られる専用カレンダー「AIスケジューラー」に入ります。メインのカレンダーは読むだけで、変更しません。色や表示の切り替えは Google カレンダーの設定から変えられます。
          </p>
        </Section>

        <Section title={t("AIの使い方", "AI MODE")}>
          <div className="px-4 py-3">
            <UsageMeter usage={usage} />
          </div>
          <div className="space-y-1.5 px-4 py-3">
            <Segmented
              label="モード"
              large={stoic}
              value={aiMode}
              options={[
                { value: "save", label: stoic ? "節約 ECO" : "節約モード" },
                { value: "boost", label: stoic ? "強化 BOOST" : "強化モード" },
              ]}
              onChange={onAiModeChange}
              testId="settings-ai-mode"
            />
            <p className="text-xs text-muted">
              {AI_MODE_HELP[aiMode]}。［元に戻す］と「元に戻して」は、どちらのモードでもAIを使いません。
            </p>
            {aiMode === "save" && (
              <p className="rounded-xl bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent-ink" data-testid="save-tip">
                {SAVE_TIP}
              </p>
            )}
          </div>
        </Section>

        <Section title={t("AIとのチャット", "CHAT LOG")}>
          <div className="space-y-2 px-4 py-3">
            <p className="text-xs text-muted">AIとのチャットは保存され、AI画面でいつでも見返せます。消してもカレンダーの予定はそのままです。</p>
            <button
              onClick={async () => {
                if (!window.confirm("AIとのチャット履歴をすべて削除しますか？（カレンダーの予定は消えません）")) return;
                if (await onClearHistory()) setCleared(true);
              }}
              className="w-full rounded-full border border-now/40 py-2 text-sm font-bold text-now stoic:h-11 stoic:rounded-xl stoic:border-[#3a2422] stoic:py-0"
            >
              {cleared ? "削除しました" : "チャット履歴を削除"}
            </button>
          </div>
        </Section>

        <Section title={t("ホーム画面に追加", "INSTALL")}>
          <div className="px-4 py-3" data-testid="install-iphone">
            <p className="mb-2 text-xs font-bold text-accent-ink">iPhone</p>
            <ol className="space-y-2 text-sm">
              <li>1. Safari でこのページを開く</li>
              <li className="flex items-center gap-1">
                2. 画面下の共有ボタン <ShareIcon className="inline size-4 text-accent-ink" /> をタップ
              </li>
              <li>3.「ホーム画面に追加」を選ぶ</li>
            </ol>
          </div>
          <div className="px-4 py-3" data-testid="install-android">
            <p className="mb-2 text-xs font-bold text-accent-ink">Android</p>
            <ol className="space-y-2 text-sm">
              <li>1. Chrome でこのページを開く</li>
              <li>2. 右上のメニュー（︙）をタップ</li>
              <li>3.「ホーム画面に追加」を選び、「インストール」（または「追加」）をタップ</li>
            </ol>
            <p className="mt-2 text-xs text-muted">画面の下に「アプリをインストール」と出たときは、そこからでも追加できます。</p>
          </div>
          <p className="px-4 py-3 text-xs text-muted">ホーム画面のアイコンから、アプリのように全画面で開けます。</p>
        </Section>

        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted">
          {stoic ? <SparkleIcon className="size-4 text-accent-ink" /> : <AppLogo className="size-5 rounded-md" />}
          AIスケジュールアシスタント
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-xs font-bold text-muted stoic:t-label stoic:mb-2.5 stoic:px-0 stoic:font-normal">{title}</h2>
      <div className="divide-y divide-line-soft overflow-hidden rounded-2xl bg-surface shadow-card">{children}</div>
    </section>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-accent-ink">{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      <span className="min-w-0 truncate text-sm text-muted stoic:t-code stoic:text-xs stoic:text-[#a8a8ae]">{value}</span>
    </div>
  );
}
