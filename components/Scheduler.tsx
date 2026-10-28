"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { login } from "@/app/actions";
import type { Block } from "@/lib/types";
import { suggestions } from "@/lib/suggest";
import { DEFAULT_TZ, addDays, localDateString } from "@/lib/time";
import type { Usage } from "@/lib/limits";
import type { ManualChange } from "@/lib/manual";
import { isUndoRequest, type ChangeItem, type ChatEntry, type Tab } from "@/lib/ui";
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
  // おすすめから AI を開いたときに入力欄へ入れる文（key が変わると入力欄に反映される）
  const [draft, setDraft] = useState<{ text: string; key: number }>({ text: "", key: 0 });
  const [eventsByDate, setEventsByDate] = useState<Record<string, Block[]>>({});
  const [now, setNow] = useState(() => new Date());
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage>({ used: 0, limit: dailyLimit, remaining: dailyLimit });
  const [older, setOlder] = useState<{ hasOlder: boolean; loading: boolean }>({ hasOlder: false, loading: false });
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
    // 明日の分は「明日の予定を組み立てる」おすすめを出すかどうかに使う
    await Promise.all([...new Set([today, date, addDays(today, 1)])].map(loadDate));
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

  // 保存されたチャット履歴。before を付けるとそれより古いものを読む
  const loadHistory = useCallback(async (before?: string) => {
    setOlder((h) => ({ ...h, loading: true }));
    try {
      const res = await fetch(`/api/messages${before ? `?before=${before}` : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: { entries: ChatEntry[]; hasMore: boolean } = await res.json();
      setEntries((prev) => {
        const known = new Set(prev.map((e) => e.id));
        return [...data.entries.filter((e) => !known.has(e.id)), ...prev];
      });
      setOlder({ hasOlder: data.hasMore, loading: false });
    } catch {
      // 履歴が読めなくても、新しいチャットはできる
    } finally {
      setOlder((h) => ({ ...h, loading: false }));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  const clearHistory = async () => {
    const res = await fetch("/api/messages", { method: "DELETE" });
    if (res.status === 401) return setAuthExpired(true);
    if (!res.ok) return false;
    setEntries([]);
    setOlder({ hasOlder: false, loading: false });
    return true;
  };

  // AI の残り回数。日付が変わったら（0時に）読み直す
  useEffect(() => {
    fetch(`/api/usage?tz=${encodeURIComponent(tz)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((u: Usage | null) => u && setUsage(u))
      .catch(() => {});
  }, [today, tz]);

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
    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: "user", text: message, at: new Date().toISOString() };
    setEntries((prev) => [...prev, userEntry]);
    setSending(true);
    const reply = (text: string, extra: Partial<Extract<ChatEntry, { role: "assistant" }>> = {}) =>
      setEntries((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text, at: new Date().toISOString(), ...extra }]);

    // 「元に戻して」だけのときは AI を呼ばず、いちばん新しい変更を取り消す（AI の利用回数を使わない）
    if (isUndoRequest(message)) {
      const latest = [...entries].reverse().find((e) => e.role === "assistant" && e.result && !e.result.undone);
      try {
        if (!latest) reply("取り消せる変更がありません。（AIの利用回数は使っていません）");
        else if (await undo(latest.id)) reply("直前の変更を元に戻しました。（AIの利用回数は使っていません）");
      } finally {
        setSending(false);
      }
      return;
    }

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
      if (data.usage) setUsage(data.usage);
      if (!res.ok) {
        reply(data.error ?? "送信に失敗しました", { error: true });
        return;
      }
      const items: ChangeItem[] = data.changes?.items ?? [];
      reply(data.reply, data.opId ? { result: { opIds: [data.opId], items } } : {});
      await loadAll();
    } catch {
      reply("通信に失敗しました。電波の良いところでもう一度お試しください。", { error: true });
    } finally {
      setSending(false);
    }
  };

  const resultOf = (entryId: string) => {
    const e = entries.find((x) => x.id === entryId);
    return e?.role === "assistant" ? e.result : undefined;
  };

  const updateResult = (entryId: string, fn: (r: NonNullable<Extract<ChatEntry, { role: "assistant" }>["result"]>) => typeof r) =>
    setEntries((prev) => prev.map((e) => (e.id === entryId && e.role === "assistant" && e.result ? { ...e, result: fn(e.result) } : e)));

  const postJson = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) setAuthExpired(true);
    return { res, data };
  };

  // AI の変更と、そのあとの手動編集をまとめて取り消す
  // ［元に戻す］。AI は呼ばないので、AI の利用回数は使わない
  const undo = async (entryId: string): Promise<boolean> => {
    const result = resultOf(entryId);
    if (!result) return false;
    const { res, data } = await postJson("/api/undo", { opIds: result.opIds });
    if (res.status === 401) return false;
    // 404 は取り消し済み（二重タップなど）
    const failed = !res.ok && res.status !== 404 ? (data.error ?? "元に戻せませんでした") : null;
    if (failed) {
      setEntries((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: failed, error: true, at: new Date().toISOString() }]);
    } else {
      updateResult(entryId, (r) => ({ ...r, undone: true }));
    }
    await loadAll();
    return !failed;
  };

  // 結果カードでの手動編集を保存する。失敗したらエラーメッセージを返す
  const saveEdits = async (entryId: string, changes: ManualChange[]): Promise<string | null> => {
    // そのチャットの操作グループに続けて記録する（履歴の結果カードと［元に戻す］をそろえるため）
    const { res, data } = await postJson("/api/blocks", { changes, opId: resultOf(entryId)?.opIds[0] });
    if (res.status === 401) return null;
    if (data.opId) updateResult(entryId, (r) => ({ ...r, opIds: r.opIds.includes(data.opId) ? r.opIds : [...r.opIds, data.opId] }));
    if (!res.ok) {
      await loadAll();
      return data.error ?? "保存できませんでした";
    }
    const saved: ChangeItem[] = data.items ?? [];
    const deleted = new Set(changes.flatMap((c) => (c.op === "delete" ? [c.id] : [])));
    updateResult(entryId, (r) => {
      const kept = r.items
        .filter((i) => !deleted.has(i.id))
        // 変更した項目は保存後の内容に。AI が追加した項目は手で直しても「追加」のまま
        .map((i) => {
          const s = saved.find((x) => x.id === i.id);
          return s ? { ...s, kind: i.kind } : i;
        });
      const created = saved.filter((s) => s.kind === "create");
      return { ...r, items: [...kept, ...created] };
    });
    await loadAll();
    return null;
  };

  // 時刻とタイムゾーンはブラウザでしか正しく決まらないので、サーバー描画では中身を出さない
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <div className="h-dvh" />;
  if (authExpired) return <Reconnect />;

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col pt-[env(safe-area-inset-top)]">
      {tab === "home" && (
        <HomeView
          date={date}
          today={today}
          tz={tz}
          now={now}
          events={eventsByDate[date] ?? []}
          suggestions={suggestions({
            date,
            tz,
            now,
            today,
            events: eventsByDate[date] ?? [],
            tomorrow: eventsByDate[addDays(today, 1)],
          })}
          error={error}
          demo={demo}
          onDateChange={setDate}
          onOpenAi={(text) => {
            if (text) setDraft((d) => ({ text, key: d.key + 1 }));
            setTab("ai");
          }}
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
          hasOlder={older.hasOlder}
          loadingOlder={older.loading}
          onLoadOlder={() => loadHistory(entries[0]?.id)}
          usage={usage}
          draft={draft}
          entries={entries}
          sending={sending}
          onSend={send}
          onUndo={undo}
          onSaveEdits={saveEdits}
          onConfirm={(items) => {
            // 変更した予定のうち一番早いものの日付をカレンダーで開く
            const first = items.map((i) => i.start).sort()[0];
            setDate(first ? localDateString(new Date(first), tz) : today);
            setTab("calendar");
          }}
          onBack={() => setTab("home")}
        />
      )}
      {tab === "settings" && <SettingsView tz={tz} email={email} demo={demo} usage={usage} onClearHistory={clearHistory} />}
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
