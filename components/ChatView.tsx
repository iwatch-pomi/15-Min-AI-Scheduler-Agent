"use client";

import { Fragment, useEffect, useRef } from "react";
import type { Usage } from "@/lib/limits";
import type { ManualChange } from "@/lib/manual";
import { localDateString } from "@/lib/time";
import { formatDateJa, type ChangeItem, type ChatEntry } from "@/lib/ui";
import ChatBar from "./ChatBar";
import { ChevronLeftIcon, Mascot } from "./icons";
import ResultCard from "./ResultCard";
import UsageMeter from "./UsageMeter";

const QUICK_ACTIONS = ["15分延長", "割り込み30分", "今のをスキップ", "今日の残りを組み直して"];
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
  onSend: (text: string) => void;
  onUndo: (entryId: string) => void;
  onSaveEdits: (entryId: string, changes: ManualChange[]) => Promise<string | null>;
  onConfirm: (items: ChangeItem[]) => void;
  onBack: () => void;
}) {
  const { tz, usage, draft, entries, hasOlder, loadingOlder, onLoadOlder, sending, onSend, onUndo, onSaveEdits, onConfirm, onBack } = props;
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastId = entries.at(-1)?.id;

  // 新しいメッセージが来たら一番下までスクロール（古い履歴を読み込んだときは動かさない）
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: lastId ? "smooth" : "auto", block: "end" });
  }, [lastId, sending]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="grid grid-cols-[40px_1fr_40px] items-center px-3 pt-3 pb-2">
        <button onClick={onBack} aria-label="ホームに戻る" className="grid size-10 place-items-center rounded-full text-muted active:bg-surface">
          <ChevronLeftIcon className="size-5" />
        </button>
        <h1 className="text-center font-bold">AIに予定を依頼</h1>
      </header>

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
            <Mascot className="mx-auto size-20" />
            <p className="font-bold">ひと言で、今日の予定が整う。</p>
            <p className="text-sm text-muted">やりたいことを送ると、空き時間に15分単位で組み込みます。</p>
            <div className="space-y-2 pt-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => onSend(ex)}
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
              <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-blk-main-bg px-4 py-2.5 text-[15px] text-heading">{entry.text}</p>
            </div>
          ) : (
            <div key={entry.id} className="flex items-start gap-2">
              <Mascot className="size-9 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <p
                  className={`w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-md bg-surface px-4 py-2.5 text-[15px] shadow-card ${entry.error ? "text-now" : ""}`}
                >
                  {entry.text}
                </p>
                {entry.costPercent !== undefined && (
                  <p className="pl-1 text-[10px] text-muted" data-testid="cost">
                    この依頼で今日のAIを {entry.costPercent < 0.1 ? "0.1% 未満" : `${entry.costPercent}%`} 使いました
                  </p>
                )}
                {entry.result && entry.result.items.length > 0 && (
                  <ResultCard
                    items={entry.result.items}
                    tz={tz}
                    undone={entry.result.undone}
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
            <Mascot className="size-9 shrink-0" />
            <div className="flex items-center gap-3 rounded-2xl rounded-tl-md bg-surface px-4 py-3 text-sm text-muted shadow-card">
              AIが予定を作成しています…
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

      <div className="space-y-2 px-4 pt-1 pb-3">
        <div className="flex justify-end">
          <UsageMeter usage={usage} compact />
        </div>
        {usage.exhausted && (
          <p className="rounded-xl bg-now/10 px-3 py-2 text-xs text-now">今日のAIの利用上限に達しました。明日の0時にもとに戻ります。</p>
        )}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {QUICK_ACTIONS.map((a, i) => (
            <button
              key={a}
              type="button"
              disabled={sending || usage.exhausted}
              onClick={() => onSend(a)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 disabled:opacity-50 ${
                i === 0 ? "bg-accent text-white" : "border border-accent/40 bg-surface text-accent-ink"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <ChatBar key={draft.key} initialText={draft.text} sending={sending} disabled={usage.exhausted} onSend={onSend} />
      </div>
    </div>
  );
}

/** 前のメッセージと日付が変わったか（日時が分からないものは区切らない） */
function dayChanged(prev: ChatEntry | undefined, entry: ChatEntry, tz: string): boolean {
  if (!entry.at) return false;
  if (!prev?.at) return true;
  return localDateString(new Date(prev.at), tz) !== localDateString(new Date(entry.at), tz);
}
