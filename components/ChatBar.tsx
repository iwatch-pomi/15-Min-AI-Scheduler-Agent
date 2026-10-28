"use client";

import { useEffect, useRef, useState } from "react";
import { MicIcon, SendIcon } from "./icons";

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

export default function ChatBar(props: { sending: boolean; disabled?: boolean; onSend: (text: string) => void; initialText?: string }) {
  const { sending, disabled, onSend, initialText = "" } = props;
  const [text, setText] = useState(initialText);
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // 音声入力はブラウザが対応しているときだけ出す（SSR との不一致を避けるためマウント後に判定）
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCanListen(getRecognition() !== null), []);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v || sending || disabled) return;
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
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(text);
      }}
    >
      <div className="flex min-w-0 flex-1 items-end rounded-3xl bg-surface pr-1 shadow-card ring-1 ring-line focus-within:ring-accent">
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
          autoFocus={!!initialText}
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          placeholder="メッセージを入力…"
          aria-label="AIへのメッセージ"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-4 py-2.5 text-[16px] leading-6 outline-none placeholder:text-muted"
        />
        {canListen && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={listening ? "音声入力を止める" : "音声で入力"}
            className={`mb-1 grid size-9 place-items-center rounded-full ${listening ? "bg-now text-white" : "text-muted"}`}
          >
            <MicIcon className="size-5" />
          </button>
        )}
      </div>
      <button
        type="submit"
        disabled={sending || disabled || !text.trim()}
        aria-label="送信"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white shadow-card transition active:scale-95 disabled:opacity-40"
      >
        {sending ? (
          <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <SendIcon className="size-5" />
        )}
      </button>
    </form>
  );
}
