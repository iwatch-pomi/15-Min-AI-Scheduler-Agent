"use client";

import { useEffect, useRef } from "react";
import type { ManualChange } from "@/lib/manual";
import type { ChangeItem, ChatEntry } from "@/lib/ui";


import ChatBar from "./ChatBar";
import { AppLogo, ChevronLeftIcon } from "./icons";
import ResultCard from "./ResultCard";

const QUICK_ACTIONS = ["15分延長", "割り込み30分", "今のをスキップ", "今日の残りを組み直して"];
const EXAMPLES = ["14時から要件定義1時間、そのあと返信15分", "明日の午前に資料作成2時間", "今日の残りを組み直して"];

export default function ChatView(props: {
  tz: string;
  entries: ChatEntry[];
  sending: boolean;
  onSend: (text: string) => void;
  onUndo: (entryId: string) => void;
  onSaveEdits: (entryId: string, changes: ManualChange[]) => Promise<string | null>;
  onConfirm: (items: ChangeItem[]) => void;
  onBack: () => void;
}) {
  const { tz, entries, sending, onSend, onUndo, onSaveEdits, onConfirm, onBack } = props;
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージが来たら一番下までスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, sending]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="grid grid-cols-[40px_1fr_40px] items-center px-3 pt-3 pb-2">
        <button onClick={onBack} aria-label="ホームに戻る" className="grid size-10 place-items-center rounded-full text-muted active:bg-surface">
          <ChevronLeftIcon className="size-5" />
        </button>
        <h1 className="text-center font-bold">AIに予定を依頼</h1>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3" data-testid="chat-log">
        {entries.length === 0 && !sending && (
          <div className="space-y-3 pt-6 text-center">
            <AppLogo className="mx-auto size-14 rounded-2xl shadow-card" />
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

        {entries.map((entry) =>
          entry.role === "user" ? (
            <div key={entry.id} className="flex justify-end">
              <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[15px] ring-1 ring-accent/15">{entry.text}</p>
            </div>
          ) : (
            <div key={entry.id} className="flex items-start gap-2">
              <AppLogo className="mt-0.5 size-8 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <p
                  className={`w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-md bg-surface px-4 py-2.5 text-[15px] shadow-card ${entry.error ? "text-now" : ""}`}
                >
                  {entry.text}
                </p>
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
          ),
        )}

        {sending && (
          <div className="flex items-start gap-2" data-testid="thinking">
            <AppLogo className="mt-0.5 size-8 shrink-0 rounded-lg" />
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
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {QUICK_ACTIONS.map((a, i) => (
            <button
              key={a}
              type="button"
              disabled={sending}
              onClick={() => onSend(a)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 disabled:opacity-50 ${
                i === 0 ? "bg-accent text-white" : "border border-accent/40 bg-surface text-accent"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <ChatBar sending={sending} onSend={onSend} />
      </div>
    </div>
  );
}
