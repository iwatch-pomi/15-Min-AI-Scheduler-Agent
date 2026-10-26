"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { logout } from "@/app/actions";
import type { Block } from "@/lib/types";
import { DEFAULT_TZ, addDays, localDateString } from "@/lib/time";
import ChatBar from "./ChatBar";
import NowBar from "./NowBar";
import Timeline from "./Timeline";

type Changes = { created: number; updated: number; deleted: number };
type Toast = { opId: string; label: string };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const noopSubscribe = () => () => {};

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

function changeLabel(c: Changes): string {
  const parts = [];
  if (c.created) parts.push(`追加${c.created}`);
  if (c.updated) parts.push(`変更${c.updated}`);
  if (c.deleted) parts.push(`削除${c.deleted}`);
  return `${parts.join("・")}件を反映しました`;
}

export default function Scheduler({ demo, email }: { demo?: boolean; email?: string }) {
  const [tz] = useState(browserTz);
  const [today, setToday] = useState(() => localDateString(new Date(), tz));
  const [date, setDate] = useState(today);
  const [events, setEvents] = useState<Block[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events?date=${date}&tz=${encodeURIComponent(tz)}`, { cache: "no-store" });
    if (res.status === 401) {
      window.location.reload();
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "予定を読み込めませんでした");
      return;
    }
    setEvents(data.events);
    setError(null);
  }, [date, tz]);

  // 日付を変えたとき・画面に戻ったとき・1分ごとに再取得（Google 側の変更も拾う）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, 60_000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // カウントダウン用に1秒ごとに時刻を進める。日付が変わったら「今日」も更新
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNow(n);
      setToday(localDateString(n, tz));
    }, 1000);
    return () => clearInterval(id);
  }, [tz]);

  // Undo トーストは12秒で消す
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 12_000);
    return () => clearTimeout(id);
  }, [toast]);

  const send = async (message: string) => {
    setSending(true);
    setReply(null);
    setToast(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, tz }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReply(data.error ?? "送信に失敗しました");
        return;
      }
      setReply(data.reply);
      if (data.opId) setToast({ opId: data.opId, label: changeLabel(data.changes) });
      await load();
    } catch {
      setReply("通信に失敗しました。電波の良いところでもう一度お試しください。");
    } finally {
      setSending(false);
    }
  };

  const undo = async (opId: string) => {
    setToast(null);
    const res = await fetch("/api/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opId }),
    });
    const data = await res.json().catch(() => ({}));
    setReply(res.ok ? "元に戻しました。" : (data.error ?? "元に戻せませんでした"));
    await load();
  };

  // 時刻とタイムゾーンはブラウザでしか正しく決まらないので、サーバー描画では中身を出さない
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <div className="h-dvh" />;

  const isToday = date === today;
  const [, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <button onClick={() => setDate(addDays(date, -1))} aria-label="前の日" className="grid size-9 place-items-center rounded-full text-muted active:bg-line">
          ‹
        </button>
        <div className="flex-1 text-center">
          <p className="text-lg font-bold tabular-nums">
            {m}/{d}（{weekday}）
          </p>
        </div>
        <button onClick={() => setDate(addDays(date, 1))} aria-label="次の日" className="grid size-9 place-items-center rounded-full text-muted active:bg-line">
          ›
        </button>
        {!isToday && (
          <button onClick={() => setDate(today)} className="rounded-full border border-line px-3 py-1 text-xs">
            今日
          </button>
        )}
        {!demo && (
          <form action={logout}>
            <button type="submit" title={email} className="rounded-full px-2 py-1 text-xs text-muted">
              ログアウト
            </button>
          </form>
        )}
      </header>

      <div className="px-4 pb-2">
        {demo && <p className="mb-2 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">デモモード：予定はサーバーのメモリに保存されます</p>}
        {isToday && <NowBar events={events} now={now} tz={tz} />}
        {error && <p className="mt-2 text-sm text-now">{error}</p>}
      </div>

      <Timeline date={date} tz={tz} events={events} now={now} isToday={isToday} />

      <div className="space-y-2 border-t border-line bg-bg px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {toast && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-white ring-1 ring-white/10" role="status">
            <span>{toast.label}</span>
            <button onClick={() => undo(toast.opId)} className="font-bold text-indigo-300">
              元に戻す
            </button>
          </div>
        )}
        {(reply || sending) && (
          <div className="flex items-start gap-2 rounded-xl bg-surface px-3.5 py-2.5 text-sm shadow-sm" data-testid="reply">
            <p className="flex-1 whitespace-pre-wrap">{sending ? <span className="text-muted">考え中…</span> : reply}</p>
            {!sending && (
              <button onClick={() => setReply(null)} aria-label="閉じる" className="text-muted">
                ×
              </button>
            )}
          </div>
        )}
        <ChatBar sending={sending} onSend={send} />
      </div>
    </div>
  );
}
