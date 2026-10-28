"use client";

import { Fragment, useEffect, useRef } from "react";
import { SAVE_TIP, type ChatSettings } from "@/lib/interrupt";
import type { Usage } from "@/lib/limits";
import type { ManualChange } from "@/lib/manual";
import { localDateString } from "@/lib/time";
import { formatDateJa, type ChangeItem, type ChatEntry } from "@/lib/ui";
import ChatBar from "./ChatBar";
import { BoltIcon, ChevronLeftIcon, GaugeIcon, Mascot, PencilIcon } from "./icons";
import { worksWithoutAi } from "./QuickActionsEditor";
import ResultCard from "./ResultCard";
import Segmented from "./Segmented";
import { useTheme } from "./ThemeContext";
import UsageMeter from "./UsageMeter";

/** 最大モード（Opus）向け：カレンダーを振り返って時間の使い方を調べる */
const ANALYZE_EXAMPLE = "直近2週間の時間の使い方を分析して、浪費している時間と改善案を教えて";
const EXAMPLES = ["14時から要件定義1時間、そのあと返信15分", "明日の午前に資料作成2時間", "今日の残りを組み直して"];

export default function ChatView(props: {
  tz: string;
  usage: Usage;
  draft: { text: string; key: number };
  entries: ChatEntry[];
  /** もっと古い履歴があるか。loadingOlder は読み込み中 */
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  sending: boolean;
  /** plain は決まった依頼（ワンタップ・例文）。割り込みモードでも割り込みとして扱わない */
  onSend: (text: string, opts?: { plain?: boolean }) => void;
  settings: ChatSettings;
  onSettingsChange: (patch: Partial<ChatSettings>) => void;
  /** マイページ（AI の使い方の設定）を開く */
  onOpenSettings: () => void;
  /** クイックボタン（端末間で共有）と、その編集シートを開く */
  quickActions: string[];
  onEditQuickActions: () => void;
  onUndo: (entryId: string) => void;
  onSaveEdits: (entryId: string, changes: ManualChange[]) => Promise<string | null>;
  onConfirm: (items: ChangeItem[]) => void;
  onBack: () => void;
}) {
  const { tz, usage, draft, entries, hasOlder, loadingOlder, onLoadOlder, sending, onSend, settings, onSettingsChange, onOpenSettings, quickActions, onEditQuickActions, onUndo, onSaveEdits, onConfirm, onBack } = props;
  // 節約モードなら、アプリで読める依頼は AI を使わずに処理できるので、上限に達していても送れる
  const save = settings.aiMode === "save";
  const bottomRef = useRef<HTMLDivElement>(null);
  const stoic = useTheme().theme === "stoic";
  const lastId = entries.at(-1)?.id;

  // 新しいメッセージが来たら一番下までスクロール（古い履歴を読み込んだときは動かさない）
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: lastId ? "smooth" : "auto", block: "end" });
  }, [lastId, sending]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {stoic ? (
        <header className="flex items-center gap-3 border-b border-line-soft px-5 pt-4 pb-3">
          <button onClick={onBack} aria-label="ホームに戻る" className="grid size-11 place-items-center rounded-xl border border-line text-heading">
            <ChevronLeftIcon className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="t-num text-[17px] font-bold tracking-[0.1em] text-heading">AI COACH</h1>
            <p className="text-[11px] text-muted">予定を投げれば、組み込む。</p>
          </div>
          <GaugeIcon className="size-[22px] text-accent-ink" strokeWidth={2} />
        </header>
      ) : (
        <header className="grid grid-cols-[40px_1fr_40px] items-center px-3 pt-3 pb-2">
          <button onClick={onBack} aria-label="ホームに戻る" className="grid size-10 place-items-center rounded-full text-muted active:bg-surface">
            <ChevronLeftIcon className="size-5" />
          </button>
          <h1 className="text-center font-bold">AIに予定を依頼</h1>
        </header>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3" data-testid="chat-log">
        {hasOlder && (
          <button
            onClick={onLoadOlder}
            disabled={loadingOlder}
            className="mx-auto block rounded-full bg-surface px-4 py-1.5 text-xs font-medium text-accent-ink shadow-card disabled:opacity-50"
          >
            {loadingOlder ? "読み込み中…" : "以前の会話を読み込む"}
          </button>
        )}
        {entries.length === 0 && !sending && (
          <div className="space-y-3 pt-6 text-center">
            {stoic ? <GaugeIcon className="mx-auto size-14 text-accent-ink" /> : <Mascot className="mx-auto size-20" />}
            <p className="font-bold">{stoic ? "予定を投げろ。15分単位で組み込む。" : "ひと言で、今日の予定が整う。"}</p>
            <p className="text-sm text-muted">やりたいことを送ると、空き時間に15分単位で組み込みます。</p>
            {save && (
              <p className="mx-auto max-w-xs rounded-xl bg-accent-soft px-3 py-2 text-left text-xs leading-relaxed text-accent-ink" data-testid="save-tip">
                {SAVE_TIP}
              </p>
            )}
            <div className="space-y-2 pt-2">
              {(settings.aiMode === "max" ? [ANALYZE_EXAMPLE, ...EXAMPLES] : EXAMPLES).map((ex) => (
                <button
                  key={ex}
                  onClick={() => onSend(ex, { plain: true })}
                  className="block w-full rounded-2xl bg-surface px-4 py-3 text-left text-sm shadow-card transition active:scale-[0.99]"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry, i) => (
          <Fragment key={entry.id}>
            {dayChanged(entries[i - 1], entry, tz) && (
              <p className="flex items-center gap-3 py-1 text-[11px] text-muted" data-testid="day-divider">
                <span className="h-px flex-1 bg-line" />
                {formatDateJa(localDateString(new Date(entry.at!), tz))}
                <span className="h-px flex-1 bg-line" />
              </p>
            )}
            {entry.role === "note" ? (
              <p className="mx-auto w-fit max-w-[90%] rounded-full bg-surface-2 px-3 py-1 text-center text-[11px] text-muted" data-testid="activity-note">
                {entry.text}
              </p>
            ) : entry.role === "user" ? (
            <div key={entry.id} className="flex justify-end">
              <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-blk-main-bg px-4 py-2.5 text-[15px] text-heading stoic:rounded-[14px] stoic:rounded-br-[4px] stoic:bg-heading stoic:px-3.5 stoic:text-sm stoic:font-medium stoic:text-bg">
                {entry.text}
              </p>
            </div>
          ) : (
            <div key={entry.id} className="flex items-start gap-2">
              {!stoic && <Mascot className="size-9 shrink-0" />}
              <div className="min-w-0 flex-1 space-y-2">
                <p
                  className={`w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-md bg-surface px-4 py-2.5 text-[15px] shadow-card stoic:rounded-[14px] stoic:rounded-bl-[4px] stoic:px-3.5 stoic:py-3 stoic:text-sm stoic:leading-relaxed ${entry.error ? "text-now" : ""}`}
                >
                  {entry.text.split("\n").map((line, i) => (
                    // 「⚠ 〜と重なっています」などの注意はオレンジで
                    <span key={i} className={`block ${line.startsWith("⚠") ? "mt-1 text-sm text-warn stoic:mt-2 stoic:text-xs" : ""}`}>
                      {stoic ? withCodeTimes(line) : line}
                    </span>
                  ))}
                </p>
                {entry.local && (
                  <p className="t-code pl-1 text-[10px] text-muted" data-testid="cost">
                    {stoic ? "LOCAL · AI未使用（残量は減っていません）" : "AIを使わずに処理しました（今日のAIは減っていません）"}
                  </p>
                )}
                {entry.costPercent !== undefined && (
                  <p className="t-code pl-1 text-[10px] text-muted" data-testid="cost">
                    {stoic
                      ? `AI${entry.model ? `（${entry.model.toUpperCase()}）` : ""} · 今日の ${entry.costPercent < 0.1 ? "0.1% 未満" : `${entry.costPercent}%`} を使用`
                      : `この依頼で今日のAIを ${entry.costPercent < 0.1 ? "0.1% 未満" : `${entry.costPercent}%`} 使いました${entry.model ? `（${entry.model}）` : ""}`}
                  </p>
                )}
                {entry.result && entry.result.items.length > 0 && (
                  <ResultCard
                    items={entry.result.items}
                    tz={tz}
                    undone={entry.result.undone}
                    local={entry.local}
                    onConfirm={() => onConfirm(entry.result!.items)}
                    onUndo={() => onUndo(entry.id)}
                    onSave={(changes) => onSaveEdits(entry.id, changes)}
                  />
                )}
              </div>
            </div>
          )}
          </Fragment>
        ))}

        {sending && (
          <div className="flex items-start gap-2" data-testid="thinking">
            {!stoic && <Mascot className="size-9 shrink-0" />}
            <div className="flex items-center gap-3 rounded-2xl rounded-tl-md bg-surface px-4 py-3 text-sm text-muted shadow-card">
              {stoic ? "組み込み中…" : "AIが予定を作成しています…"}
              <span className="flex h-4 items-center gap-0.5" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="h-full w-0.5 animate-wave rounded-full bg-accent" style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-2 px-4 pt-1 pb-3 stoic:space-y-2.5 stoic:border-t stoic:border-line-soft stoic:px-5 stoic:pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-muted stoic:t-label stoic:rounded-md stoic:border stoic:border-line stoic:bg-transparent stoic:px-2 stoic:py-[5px] stoic:text-[10px] stoic:font-normal stoic:tracking-[0.12em] stoic:text-[#a8a8ae]"
            data-testid="ai-mode-chip"
          >
            {stoic
              ? `${{ save: "ECO", normal: "STD", boost: "BOOST", max: "MAX" }[settings.aiMode]} MODE`
              : { save: "節約モード", normal: "通常モード", boost: "強化モード", max: "最大モード" }[settings.aiMode]}
          </button>
          <UsageMeter usage={usage} compact />
        </div>
        {usage.exhausted && (
          <p className="rounded-xl bg-now/10 px-3 py-2 text-xs text-now">
            今日のAIの利用上限に達しました。明日の0時にもとに戻ります。
            {save && "「14時から会議1時間」「15分延長」のような決まった形の依頼は、AIを使わずに処理できます。時刻と長さをはっきり書いて1件ずつ送ってください。"}
          </p>
        )}
        <InterruptPanel settings={settings} onChange={onSettingsChange} />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {quickActions.map((a, i) => (
            <button
              key={a}
              type="button"
              // 節約モードなら、AI を使わずに処理できるボタンは上限に達していても押せる
              disabled={sending || (usage.exhausted && !(save && worksWithoutAi(a)))}
              onClick={() => onSend(a, { plain: true })}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 disabled:opacity-50 stoic:h-9 stoic:rounded-[10px] stoic:py-0 ${
                i === 0
                  ? "bg-accent text-on-accent stoic:border stoic:border-accent"
                  : "border border-accent/40 bg-surface text-accent-ink stoic:border-line stoic:bg-transparent stoic:font-medium stoic:text-heading"
              }`}
              data-testid="quick-action"
            >
              {stoic && /^\d+分延長$/.test(a) ? `+${a}` : a}
            </button>
          ))}
          <button
            type="button"
            onClick={onEditQuickActions}
            aria-label="クイックボタンを編集"
            className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-xs text-muted stoic:h-9 stoic:rounded-[10px] stoic:py-0"
            data-testid="edit-quick-actions"
          >
            <PencilIcon className="size-3.5" />
            編集
          </button>
        </div>
        <ChatBar
          key={draft.key}
          initialText={draft.text}
          sending={sending}
          disabled={usage.exhausted && !save}
          onSend={(text) => onSend(text)}
          placeholder={settings.interrupt ? "例：45分 買い物" : stoic ? "予定を入力…" : undefined}
          highlight={settings.interrupt}
        />
      </div>
    </div>
  );
}

/** ストイック：返事の中の時刻（22:00–23:00 など）を等幅で */
function withCodeTimes(line: string) {
  return line.split(/(\d{1,2}:\d{2}(?:[-–]\d{1,2}:\d{2})?)/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="t-code text-[13px]">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** 割り込みモードの切り替えと、開始時刻・後ろの予定・AI の使い方の選択 */
function InterruptPanel({ settings, onChange }: { settings: ChatSettings; onChange: (patch: Partial<ChatSettings>) => void }) {
  const on = settings.interrupt;
  return (
    <div className={`rounded-2xl px-3 py-2 transition ${on ? "bg-surface shadow-card" : ""}`} data-testid="interrupt-panel">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange({ interrupt: !on })}
        className="flex w-full items-center gap-2 text-left"
        data-testid="interrupt-toggle"
      >
        <BoltIcon className={`size-4 ${on ? "text-accent-ink" : "text-muted"}`} />
        <span className={`flex-1 text-xs font-bold ${on ? "text-accent-ink" : "text-muted"}`}>
          割り込みモード{on && <span className="ml-1.5 font-normal text-muted">送った予定を、すぐに割り込ませます</span>}
        </span>
        <span
          className={`relative h-5 w-9 shrink-0 rounded-full transition stoic:h-7 stoic:w-[46px] stoic:border stoic:border-line ${
            on ? "bg-accent stoic:border-accent" : "bg-line stoic:bg-surface-2"
          }`}
        >
          <span
            className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] stoic:top-[3px] stoic:size-5 stoic:shadow-none ${
              on ? "left-4.5 stoic:left-[21px] stoic:bg-on-accent" : "left-0.5 stoic:left-[3px] stoic:bg-muted"
            }`}
          />
        </span>
      </button>
      {on && (
        <div className="mt-2 space-y-1.5">
          <Segmented
            label="開始"
            value={settings.start}
            options={[
              { value: "now", label: "今すぐ" },
              { value: "after_current", label: "今の予定の後" },
            ]}
            onChange={(start) => onChange({ start })}
            testId="interrupt-start"
          />
          <Segmented
            label="後ろの予定"
            value={settings.mode}
            options={[
              { value: "slide", label: "スライド" },
              { value: "trim", label: "削る" },
            ]}
            onChange={(mode) => onChange({ mode })}
            testId="interrupt-mode"
          />
          <p className="pl-[72px] text-[10px] text-muted">
            {settings.mode === "slide" ? "後ろの予定を、割り込みの分だけ後ろにずらします。" : "重なった分だけ削り、そのあとの予定は動かしません。"}
          </p>
        </div>
      )}
    </div>
  );
}

/** 前のメッセージと日付が変わったか（日時が分からないものは区切らない） */
function dayChanged(prev: ChatEntry | undefined, entry: ChatEntry, tz: string): boolean {
  if (!entry.at) return false;
  if (!prev?.at) return true;
  return localDateString(new Date(prev.at), tz) !== localDateString(new Date(entry.at), tz);
}
