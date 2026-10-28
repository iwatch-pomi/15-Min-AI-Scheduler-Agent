"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { login } from "@/app/actions";
import type { Block } from "@/lib/types";
import { DEFAULT_TZ, localDateString } from "@/lib/time";
import type { ChangeItem, ChatEntry, Tab } from "@/lib/ui";
import CalendarView from "./CalendarView";
import ChatView from "./ChatView";
import HomeView from "./HomeView";
import { AppLogo } from "./icons";
import SettingsView from "./SettingsView";
import TabBar from "./TabBar";

const TABS: Tab[] = ["home", "calendar", "ai", "settings"];
const noopSubscribe = () => () => {};

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

function tabFromHash(): Tab {
  if (typeof window === "undefined") return "home";
  const t = window.location.hash.slice(1) as Tab;
  return TABS.includes(t) ? t : "home";
}

export default function Scheduler(props: { demo?: boolean; email?: string; dailyLimit: number }) {
  const { demo, email, dailyLimit } = props;
  const [tz] = useState(browserTz);
  const [today, setToday] = useState(() => localDateString(new Date(), tz));
  const [date, setDate] = useState(today);
  const [eventsByDate, setEventsByDate] = useState<Record<string, Block[]>>({});
  const [now, setNow] = useState(() => new Date());
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Google との接続切れ（期限切れ・権限の取り消し）。再読み込みではなくログインし直しの画面を出す
  const [authExpired, setAuthExpired] = useState(false);

  // 選択中のタブは URL の hash に残す（再読み込みしても同じタブで開く）
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", t === "home" ? window.location.pathname : `#${t}`);
  }, []);

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const loadDate = useCallback(
    async (d: string) => {
      const res = await fetch(`/api/events?date=${d}&tz=${encodeURIComponent(tz)}`, { cache: "no-store" });
      if (res.status === 401) {
        setAuthExpired(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "予定を読み込めませんでした");
        return;
      }
      setEventsByDate((prev) => ({ ...prev, [d]: data.events }));
      setError(null);
    },
    [tz],
  );

  // ホームは「今日」、カレンダーは選んだ日の予定を使うので両方読む
  const loadAll = useCallback(async () => {
    await Promise.all([...new Set([today, date])].map(loadDate));
  }, [today, date, loadDate]);

  // 日付を変えたとき・画面に戻ったとき・1分ごとに再取得（Google 側の変更も拾う）
  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 60_000);
    const onVisible = () => document.visibilityState === "visible" && loadAll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadAll]);

  // カウントダウン用に1秒ごとに時刻を進める。日付が変わったら「今日」も更新
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNow(n);
      setToday(localDateString(n, tz));
    }, 1000);
    return () => clearInterval(id);
  }, [tz]);

  const send = async (message: string) => {
    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: "user", text: message };
    setEntries((prev) => [...prev, userEntry]);
    setSending(true);
    const reply = (text: string, extra: Partial<Extract<ChatEntry, { role: "assistant" }>> = {}) =>
      setEntries((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text, ...extra }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, tz }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setAuthExpired(true);
        return;
      }
      if (!res.ok) {
        reply(data.error ?? "送信に失敗しました", { error: true });
        return;
      }
      const items: ChangeItem[] = data.changes?.items ?? [];
      reply(data.reply, data.opId ? { result: { opId: data.opId, items } } : {});
      await loadAll();
    } catch {
      reply("通信に失敗しました。電波の良いところでもう一度お試しください。", { error: true });
    } finally {
      setSending(false);
    }
  };

  const undo = async (entryId: string, opId: string) => {
    const res = await fetch("/api/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setAuthExpired(true);
      return;
    }
    if (res.ok) {
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId && e.role === "assistant" && e.result ? { ...e, result: { ...e.result, undone: true } } : e)),
      );
    } else {
      setEntries((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: data.error ?? "元に戻せませんでした", error: true }]);
    }
    await loadAll();
  };

  // 時刻とタイムゾーンはブラウザでしか正しく決まらないので、サーバー描画では中身を出さない
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <div className="h-dvh" />;
  if (authExpired) return <Reconnect />;

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col pt-[env(safe-area-inset-top)]">
      {tab === "home" && (
        <HomeView
          today={today}
          tz={tz}
          now={now}
          events={eventsByDate[today] ?? []}
          error={error}
          demo={demo}
          onOpenAi={() => setTab("ai")}
        />
      )}
      {tab === "calendar" && (
        <CalendarView
          date={date}
          today={today}
          tz={tz}
          now={now}
          events={eventsByDate[date] ?? []}
          error={error}
          onDateChange={setDate}
        />
      )}
      {tab === "ai" && (
        <ChatView
          tz={tz}
          entries={entries}
          sending={sending}
          onSend={send}
          onUndo={undo}
          onConfirm={(items) => {
            // 変更した予定のうち一番早いものの日付をカレンダーで開く
            const first = items.map((i) => i.start).sort()[0];
            setDate(first ? localDateString(new Date(first), tz) : today);
            setTab("calendar");
          }}
          onBack={() => setTab("home")}
        />
      )}
      {tab === "settings" && <SettingsView tz={tz} email={email} demo={demo} dailyLimit={dailyLimit} />}
      <TabBar tab={tab} onChange={setTab} />
    </div>
  );
}

function Reconnect() {
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col justify-center gap-6 px-6" data-testid="reconnect">
      <AppLogo className="size-14 rounded-2xl shadow-card" />
      <div className="space-y-2">
        <h1 className="text-xl font-bold">Google との接続が切れました</h1>
        <p className="text-sm text-muted">
          セキュリティのため、しばらくするとログインし直しが必要になります。予定はそのまま残っています。
        </p>
      </div>
      <form action={login}>
        <button type="submit" className="w-full rounded-full bg-accent px-5 py-3.5 font-bold text-white shadow-card transition active:scale-[0.99]">
          Google でログインし直す
        </button>
      </form>
    </main>
  );
}
