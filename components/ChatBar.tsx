"use client";

import { useEffect, useRef, useState } from "react";

const QUICK_ACTIONS = ["15分延長", "今のをスキップ", "割り込み30分", "今日の残りを組み直して"];

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export default function ChatBar({ sending, onSend }: { sending: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // 音声入力はブラウザが対応しているときだけ出す（SSR との不一致を避けるためマウント後に判定）
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCanListen(getRecognition() !== null), []);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v || sending) return;
    onSend(v);
    setText("");
  };

  const toggleMic = () => {
    const Recognition = getRecognition();
    if (!Recognition) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const r = new Recognition();
    r.lang = "ja-JP";
    r.interimResults = false;
    r.onresult = (e) => setText((prev) => prev + (e.results[0]?.[0]?.transcript ?? ""));
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className="space-y-2">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            disabled={sending}
            onClick={() => submit(a)}
            className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-text transition active:scale-95 disabled:opacity-50"
          >
            {a}
          </button>
        ))}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <div className="flex min-w-0 flex-1 items-end rounded-2xl border border-line bg-surface pr-1 focus-within:border-accent">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit(text);
              }
            }}
            rows={1}
            placeholder="例：14時から資料作成1時間"
            aria-label="AIへのメッセージ"
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3.5 py-2.5 text-[16px] leading-6 outline-none placeholder:text-muted"
          />
          {canListen && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={listening ? "音声入力を止める" : "音声で入力"}
              className={`mb-1 grid size-9 place-items-center rounded-full ${listening ? "bg-now text-white" : "text-muted"}`}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={sending || !text.trim()}
          aria-label="送信"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white transition active:scale-95 disabled:opacity-40"
        >
          {sending ? (
            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
