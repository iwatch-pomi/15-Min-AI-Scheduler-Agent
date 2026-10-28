"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { login } from "@/app/actions";
import type { Block } from "@/lib/types";
import { noteText } from "@/lib/history";
import { suggestions, type Suggestion } from "@/lib/suggest";
import { DEFAULT_TZ, addDays, localDateString, localTime } from "@/lib/time";
import { DEFAULT_CHAT_SETTINGS, interruptLabel, type ChatSettings } from "@/lib/interrupt";
import { THEME_COOKIE, arcProgress, defaultArc, isValidArc, parseTheme, stoicLine, timeSlot, type Arc, type Theme } from "@/lib/theme";
import type { Usage } from "@/lib/limits";
import type { ManualChange } from "@/lib/manual";
import type { Routine, RoutineInput } from "@/lib/routines";
import { isUndoRequest, type ChangeItem, type ChatEntry, type Tab } from "@/lib/ui";
import CalendarView from "./CalendarView";
import ChatView from "./ChatView";
import HomeView from "./HomeView";
import { AppLogo } from "./icons";
import SettingsView from "./SettingsView";
import TabBar from "./TabBar";
import { ThemeContext } from "./ThemeContext";

const TABS: Tab[] = ["home", "calendar", "ai", "settings"];
const noopSubscribe = () => () => {};

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

/** この端末の保存（使えない環境では何もしない） */
function readLocal(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても、この画面では使える
  }
}

function tabFromHash(): Tab {
  if (typeof window === "undefined") return "home";
  const t = window.location.hash.slice(1) as Tab;
  return TABS.includes(t) ? t : "home";
}

export default function Scheduler(props: { demo?: boolean; email?: string }) {
  const { demo, email } = props;
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
  const [usage, setUsage] = useState<Usage>({ remainingPercent: 100, exhausted: false });
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

  // AI 画面の設定（割り込みモード・強化／節約）。次に開いたときも同じになるよう、この端末に保存する
  const [chatSettings, setChatSettings] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ai15:chat-settings") ?? "{}") as Partial<ChatSettings>;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChatSettings({ ...DEFAULT_CHAT_SETTINGS, ...saved });
    } catch {
      // 保存できない環境では既定のまま
    }
  }, []);
  const changeChatSettings = (patch: Partial<ChatSettings>) =>
    setChatSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem("ai15:chat-settings", JSON.stringify(next));
      } catch {
        // 保存できなくても、この画面では使える
      }
      return next;
    });

  // デザイン（やさしい／ストイック）。サーバーが cookie から <html data-theme> に付けたものを使う
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof document === "undefined" ? "soft" : parseTheme(document.documentElement.dataset.theme),
  );
  const changeTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "stoic" ? "#0a0a0b" : "#faf9f6");
    // 読み込み直さずにホーム画面に追加しても、今のデザインのアイコンになるように差し替える
    const icon = (soft: string) => (t === "stoic" ? soft.replace(/^\/(stoic-)?/, "/stoic-") : soft.replace(/^\/stoic-/, "/"));
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => {
      l.href = icon(new URL(l.href).pathname);
    });
    document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.setAttribute("href", t === "stoic" ? "/manifest-stoic.webmanifest" : "/manifest.webmanifest");
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute("content", t === "stoic" ? "black" : "default");
  };
  // 挑戦（Winter Arc など）の名前と期間。この端末に保存する
  const [savedArc, setSavedArc] = useState<Arc | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ai15:arc") ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isValidArc(saved)) setSavedArc(saved);
    } catch {
      // 保存できない環境では初期値のまま
    }
  }, []);
  const arc = savedArc ?? defaultArc(today);
  const changeArc = (next: Arc | null) => {
    setSavedArc(next);
    try {
      if (next) localStorage.setItem("ai15:arc", JSON.stringify(next));
      else localStorage.removeItem("ai15:arc");
    } catch {
      // 保存できなくても、この画面では使える
    }
  };

  // ストイックのホームに出す「時間帯のひと言」。AI が名言のように考える（使用量を少し使う）。
  // 時間帯ごとに1回だけ作り、この端末に保存する。オフにすると出さず、AI も使わない
  const [quoteOn, setQuoteOn] = useState(() => readLocal("ai15:quote-on") !== "0");
  type QuoteCache = { key: string; text: string | null; recent: string[] };
  const [quote, setQuote] = useState<QuoteCache | null>(() => {
    try {
      return JSON.parse(readLocal("ai15:quote") ?? "null");
    } catch {
      return null;
    }
  });
  const hour = Number(localTime(now, tz).slice(0, 2));
  const quoteKey = `${today}:${timeSlot(hour)}`;
  const quoteRequested = useRef<string | null>(null);
  const changeQuoteOn = (on: boolean) => {
    setQuoteOn(on);
    writeLocal("ai15:quote-on", on ? "1" : "0");
  };
  useEffect(() => {
    if (theme !== "stoic" || !quoteOn || quote?.key === quoteKey || quoteRequested.current === quoteKey) return;
    quoteRequested.current = quoteKey;
    const recent = quote?.recent ?? [];
    const save = (text: string | null) => {
      // 作れなかったとき（上限・エラー）は null を保存し、この時間帯はアプリのひと言を出す（何度も AI を呼ばない）
      const next = { key: quoteKey, text, recent: text ? [text, ...recent].slice(0, 5) : recent };
      setQuote(next);
      writeLocal("ai15:quote", JSON.stringify(next));
    };
    const p = arcProgress(arc, today);
    fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot: timeSlot(hour),
        tz,
        arc: p.status === "active" ? { name: arc.name, day: p.day, total: p.total } : null,
        recent: recent.slice(0, 5),
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (data.usage) setUsage(data.usage);
        save(res.ok && typeof data.quote === "string" ? data.quote : null);
      })
      .catch(() => save(null));
  }, [theme, quoteOn, quote, quoteKey, hour, arc, today, tz]);
  // 画面に出すひと言。null は出さない、"" は作っている途中
  const stoicQuote = !quoteOn ? null : quote?.key === quoteKey ? (quote.text ?? stoicLine(hour, today)) : "";

  // AI で作ったおすすめ（日付ごと）。再読み込みでもう一度費用がかからないよう、この端末に保存する
  // tone は作ったときのデザイン。今のデザインと違えば使わない（ストイックとやさしいで口調が違うため）
  type AiSuggest = { items: Suggestion[]; costPercent: number; at: string; tone?: Theme };
  const [aiSuggest, setAiSuggest] = useState<Record<string, AiSuggest>>({});
  const [suggestState, setSuggestState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ai15:suggest") ?? "{}") as Record<string, AiSuggest>;
      // 過去の日のものは捨てる
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAiSuggest(Object.fromEntries(Object.entries(saved).filter(([d]) => d >= today)));
    } catch {
      // 保存できない環境（プライベートブラウズなど）では毎回作り直す
    }
  }, [today]);

  const refreshSuggestions = async (d: string) => {
    setSuggestState({ loading: true, error: null });
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d, tz, tone: theme }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return setAuthExpired(true);
      if (data.usage) setUsage(data.usage);
      if (!res.ok) return setSuggestState({ loading: false, error: data.error ?? "おすすめを更新できませんでした" });
      setAiSuggest((prev) => {
        const next = { ...prev, [d]: { items: data.suggestions, costPercent: data.costPercent, at: new Date().toISOString(), tone: theme } };
        try {
          localStorage.setItem("ai15:suggest", JSON.stringify(next));
        } catch {
          // 保存できなくても表示はする
        }
        return next;
      });
      setSuggestState({ loading: false, error: null });
    } catch {
      setSuggestState({ loading: false, error: "通信に失敗しました" });
    }
  };

  // 毎日のルーティン（null は読み込み中）
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const loadRoutines = useCallback(async () => {
    const res = await fetch("/api/routines", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setRoutines((await res.json()).routines);
    else setRoutines((r) => r ?? []);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRoutines();
  }, [loadRoutines]);

  const routineRequest = async (method: "POST" | "PATCH" | "DELETE", body: object): Promise<string | null> => {
    const res = await fetch("/api/routines", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, tz }),
    }).catch(() => null);
    if (!res) return "通信に失敗しました";
    if (res.status === 401) {
      setAuthExpired(true);
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error ?? "保存できませんでした";
    await Promise.all([loadRoutines(), loadAll()]);
    return null;
  };
  const saveRoutine = (id: string | null, input: RoutineInput) => routineRequest(id ? "PATCH" : "POST", id ? { id, ...input } : input);
  const deleteRoutine = (id: string) => routineRequest("DELETE", { id });

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

  const send = async (message: string, opts: { plain?: boolean } = {}) => {
    // 割り込みモードでも「元に戻して」やワンタップの依頼は、そのまま扱う
    const interrupt = chatSettings.interrupt && !opts.plain && !isUndoRequest(message);
    const userEntry: ChatEntry = {
      id: crypto.randomUUID(),
      role: "user",
      text: interrupt ? interruptLabel(message) : message,
      at: new Date().toISOString(),
    };
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
        body: JSON.stringify({
          message,
          tz,
          aiMode: chatSettings.aiMode,
          interruptPrefs: { start: chatSettings.start, mode: chatSettings.mode },
          ...(interrupt ? { interrupt: { start: chatSettings.start, mode: chatSettings.mode } } : {}),
        }),
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
      reply(data.reply, { costPercent: data.costPercent, local: data.local, ...(data.opId ? { result: { opIds: [data.opId], items } } : {}) });
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

  // 画面での操作の記録（サーバーでチャット履歴にも保存され、AI に伝わる）を、その場でも表示する
  const addNote = (note: string | null | undefined) => {
    if (note) setEntries((prev) => [...prev, { id: crypto.randomUUID(), role: "note", text: noteText(note), at: new Date().toISOString() }]);
  };

  // AI の変更と、そのあとの手動編集をまとめて取り消す
  // ［元に戻す］。AI は呼ばないので、AI の利用回数は使わない
  const undo = async (entryId: string): Promise<boolean> => {
    const result = resultOf(entryId);
    if (!result) return false;
    const { res, data } = await postJson("/api/undo", { opIds: result.opIds, tz });
    if (res.status === 401) return false;
    // 404 は取り消し済み（二重タップなど）
    const failed = !res.ok && res.status !== 404 ? (data.error ?? "元に戻せませんでした") : null;
    if (failed) {
      setEntries((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: failed, error: true, at: new Date().toISOString() }]);
    } else {
      updateResult(entryId, (r) => ({ ...r, undone: true }));
      addNote(data.note);
    }
    await loadAll();
    return !failed;
  };

  // 結果カードでの手動編集を保存する。失敗したらエラーメッセージを返す
  const saveEdits = async (entryId: string, changes: ManualChange[]): Promise<string | null> => {
    // そのチャットの操作グループに続けて記録する（履歴の結果カードと［元に戻す］をそろえるため）
    const { res, data } = await postJson("/api/blocks", { changes, opId: resultOf(entryId)?.opIds[0], tz });
    if (res.status === 401) return null;
    if (data.opId) updateResult(entryId, (r) => ({ ...r, opIds: r.opIds.includes(data.opId) ? r.opIds : [...r.opIds, data.opId] }));
    if (!res.ok) {
      await loadAll();
      return data.error ?? "保存できませんでした";
    }
    addNote(data.note);
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

  // AI で作ったおすすめは、今のデザインの口調で作ったものだけ使う
  const cachedSuggest = aiSuggest[date] && (aiSuggest[date].tone ?? "soft") === theme ? aiSuggest[date] : undefined;

  // 時刻とタイムゾーンはブラウザでしか正しく決まらないので、サーバー描画では中身を出さない
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <div className="h-dvh" />;
  if (authExpired) return <Reconnect />;

  return (
    <ThemeContext value={{ theme, arc }}>
    <div className="mx-auto flex h-dvh max-w-xl flex-col pt-[env(safe-area-inset-top)]">
      {tab === "home" && (
        <HomeView
          date={date}
          today={today}
          tz={tz}
          now={now}
          events={eventsByDate[date] ?? []}
          suggestions={
            cachedSuggest?.items ??
            suggestions({
              date,
              tz,
              now,
              today,
              events: eventsByDate[date] ?? [],
              tomorrow: eventsByDate[addDays(today, 1)],
              tone: theme,
            })
          }
          aiSuggest={cachedSuggest ? { costPercent: cachedSuggest.costPercent, at: cachedSuggest.at } : null}
          suggestLoading={suggestState.loading}
          suggestError={suggestState.error}
          usageExhausted={usage.exhausted}
          onRefreshSuggestions={() => refreshSuggestions(date)}
          stoicQuote={stoicQuote}
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
          settings={chatSettings}
          onSettingsChange={changeChatSettings}
          onOpenSettings={() => setTab("settings")}
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
      {tab === "settings" && <SettingsView tz={tz} email={email} demo={demo} usage={usage} onClearHistory={clearHistory}
          aiMode={chatSettings.aiMode}
          onAiModeChange={(aiMode) => changeChatSettings({ aiMode })}
          today={today}
          onThemeChange={changeTheme}
          onArcChange={changeArc}
          quoteOn={quoteOn}
          onQuoteOnChange={changeQuoteOn}
          routines={routines}
          onSaveRoutine={saveRoutine}
          onDeleteRoutine={deleteRoutine}
        />}
      <TabBar tab={tab} onChange={setTab} />
    </div>
    </ThemeContext>
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
        <button type="submit" className="w-full rounded-full bg-accent px-5 py-3.5 font-bold text-on-accent shadow-card transition active:scale-[0.99]">
          Google でログインし直す
        </button>
      </form>
    </main>
  );
}
