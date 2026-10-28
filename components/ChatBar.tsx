"use client";

import { useEffect, useRef, useState } from "react";
import { MicIcon, SendIcon, StopIcon } from "./icons";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

/** 停止を押し忘れても、マイクが入ったままにならないよう、この秒数で自動で止める */
const MAX_LISTEN_SEC = 60;

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export default function ChatBar(props: {
  sending: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  initialText?: string;
  placeholder?: string;
  /** 割り込みモードのときは枠をエメラルドにする */
  highlight?: boolean;
}) {
  const { sending, disabled, onSend, initialText = "", placeholder = "メッセージを入力…", highlight } = props;
  const [text, setText] = useState(initialText);
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // 聞き取りを始めてからの秒数
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  // 音声入力はブラウザが対応しているときだけ出す（SSR との不一致を避けるためマウント後に判定）
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setCanListen(getRecognition() !== null), []);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v || sending || disabled) return;
    // 聞き取り中に送ったら、マイクも止める
    stopMic();
    onSend(v);
    setText("");
  };

  const stopMic = () => recognitionRef.current?.stop();

  // 音声入力は、話し終わったら［停止］を押して終える（話すのをやめても自動では終わらない）
  const startMic = () => {
    const Recognition = getRecognition();
    if (!Recognition || listening) return;
    const r = new Recognition();
    r.lang = "ja-JP";
    r.continuous = true;
    r.interimResults = true;
    // 話し始める前に入力欄にあった文に、聞き取った文を足していく（途中の文もその場で見せる）
    const base = text;
    r.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0]?.transcript ?? "";
      setText(base + heard);
    };
    r.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    // マイクが許可されていない・使えないときは、聞き取り中のままにしない
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setMicError("マイクの使用が許可されていません。ブラウザの設定で許可してください");
      else if (e.error && e.error !== "no-speech" && e.error !== "aborted") setMicError("音声を聞き取れませんでした。もう一度お試しください");
      recognitionRef.current = null;
      setListening(false);
    };
    setMicError(null);
    recognitionRef.current = r;
    setListening(true);
    setElapsed(0);
    r.start();
  };

  // 聞き取り中の経過時間。上限で自動で止める
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [listening]);
  useEffect(() => {
    if (listening && elapsed >= MAX_LISTEN_SEC) stopMic();
  }, [listening, elapsed]);
  // 画面を離れた・アプリを閉じた・この欄が消えたときも止める
  useEffect(() => {
    const onHidden = () => document.visibilityState === "hidden" && stopMic();
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      recognitionRef.current?.stop();
    };
  }, []);

  return (
    <div className="space-y-2">
      {micError && !listening && (
        <p className="rounded-xl bg-now/10 px-3 py-2 text-xs text-now" role="alert">
          {micError}
        </p>
      )}
      {listening && (
        <div className="flex items-center gap-2 rounded-2xl bg-now/10 px-3 py-2 text-xs text-now stoic:rounded-xl" role="status" data-testid="listening">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-now" />
          <span className="flex-1">
            聞き取り中…話し終わったら［停止］を押してください
            <span className="t-code ml-1 text-muted">（{MAX_LISTEN_SEC - elapsed}秒で自動停止）</span>
          </span>
          <button type="button" onClick={stopMic} className="flex shrink-0 items-center gap-1 rounded-full bg-now px-3 py-1.5 font-bold text-white stoic:rounded-lg">
            <StopIcon className="size-3.5" />
            停止
          </button>
        </div>
      )}
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit(text);
      }}
    >
      <div className={`flex min-w-0 flex-1 items-end rounded-3xl bg-surface pr-1 shadow-card stoic:min-h-12 stoic:items-center stoic:rounded-[14px] stoic:shadow-none ${highlight ? "ring-2 ring-accent" : "ring-1 ring-line"} focus-within:ring-accent`}>
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
          placeholder={placeholder}
          aria-label="AIへのメッセージ"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-4 py-2.5 text-[16px] leading-6 outline-none placeholder:text-muted"
        />
        {canListen && (
          <button
            type="button"
            onClick={listening ? stopMic : startMic}
            aria-label={listening ? "音声入力を停止" : "音声で入力"}
            aria-pressed={listening}
            className={`mb-1 grid size-9 place-items-center rounded-full stoic:mb-0 ${listening ? "bg-now text-white" : "text-muted"}`}
          >
            {listening ? <StopIcon className="size-5" /> : <MicIcon className="size-5" />}
          </button>
        )}
      </div>
      <button
        type="submit"
        disabled={sending || disabled || !text.trim()}
        aria-label="送信"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-card transition active:scale-95 disabled:opacity-40 stoic:size-12 stoic:rounded-[14px] stoic:shadow-none"
      >
        {sending ? (
          <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <SendIcon className="size-5" />
        )}
      </button>
    </form>
    </div>
  );
}
