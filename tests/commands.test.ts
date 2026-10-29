import { describe, expect, it } from "vitest";
import { MemoryCalendar } from "@/lib/calendar/memory";
import { parseCommand, runCommand } from "@/lib/commands";
import { RecordingCalendar, undoOps } from "@/lib/ops";

const tz = "Asia/Tokyo";
const now = new Date("2026-10-26T04:05:00Z"); // 13:05 JST
const jst = (hhmm: string, d = "26") => new Date(`2026-10-${d}T${hhmm}:00+09:00`).toISOString();
const hm = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

describe("parseCommand（アプリで読める依頼）", () => {
  it.each([
    ["15分延長", { kind: "extend", minutes: 15 }],
    ["10分押してる", { kind: "extend", minutes: 15 }],
    ["30分遅れた", { kind: "extend", minutes: 30 }],
    ["今のをスキップ", { kind: "skip" }],
    ["今の予定はやめる", { kind: "skip" }],
    ["割り込み30分", { kind: "interrupt", title: "割り込み", minutes: 30 }],
    ["割り込み 電話 15分", { kind: "interrupt", title: "電話", minutes: 15 }],
    ["14時から要件定義1時間", { kind: "add", title: "要件定義", minutes: 60, day: 0, time: { h: 14, m: 0 } }],
    ["15:00から90分、課題を入れて", { kind: "add", title: "課題", minutes: 90, day: 0, time: { h: 15, m: 0 } }],
    ["明日 資料作成 2時間", { kind: "add", title: "資料作成", minutes: 120, day: 1 }],
    ["午後3時半から散歩30分", { kind: "add", title: "散歩", minutes: 30, day: 0, time: { h: 15, m: 30 } }],
    ["昼食 45分", { kind: "add", title: "昼食", minutes: 45, day: 0 }],
  ])("%s", (text, expected) => {
    expect(parseCommand(text)).toEqual(expected);
  });

  it.each([
    "14時から要件定義1時間、そのあと返信15分",
    "明日の午前に資料作成2時間",
    "今日の残りを組み直して",
    "夜にレポート",
    "今日の予定は？",
    "来週の月曜に会議1時間",
    "ちょっとコンビニ",
  ])("%s → AI に任せる", (text) => {
    expect(parseCommand(text)).toBeNull();
  });
});

function setup() {
  const base = new MemoryCalendar(crypto.randomUUID(), [
    { id: "ai-a", title: "資料作成", start: jst("12:30"), end: jst("13:30"), ai: true },
    { id: "ai-b", title: "返信", start: jst("13:30"), end: jst("14:00"), ai: true },
    { id: "mtg", title: "MTG", start: jst("14:00"), end: jst("15:00"), ai: false },
    { id: "ai-c", title: "レビュー", start: jst("15:00"), end: jst("15:30"), ai: true },
  ]);
  return { base, cal: new RecordingCalendar(base) };
}
const run = (cal: RecordingCalendar, text: string) =>
  runCommand(parseCommand(text)!, cal, { tz, now, interrupt: { start: "now", mode: "slide" } });
const snapshot = async (base: MemoryCalendar, d = "26") =>
  (await base.list(new Date(jst("00:00", d)), new Date(jst("23:59", d)))).map((b) => `${hm(b.start)}-${hm(b.end)} ${b.title}`);

describe("runCommand", () => {
  it("延長：今の予定を伸ばし、後ろの AI の予定をずらす（メインの予定は動かさない）", async () => {
    const { base, cal } = setup();
    const reply = await run(cal, "15分延長");
    expect(await snapshot(base)).toEqual(["12:30-13:45 資料作成", "13:45-14:15 返信", "14:00-15:00 MTG", "15:15-15:45 レビュー"]);
    expect(reply).toContain("「資料作成」を15分延長して 13:45 までにしました。後ろの予定を15分ずらしました（2件）");
    expect(reply).toContain("⚠ ずらした「返信」が「MTG」と重なりました");
  });

  it("スキップ：今の AI の予定を消す", async () => {
    const { base, cal } = setup();
    expect(await run(cal, "今のをスキップ")).toBe("今の「資料作成」（12:30-13:30）をスキップしました。");
    expect(await snapshot(base)).not.toContain("12:30-13:30 資料作成");
  });

  it("時刻つきの追加：その時刻に入れ、重なりを知らせる", async () => {
    const { base, cal } = setup();
    const reply = await run(cal, "14時から要件定義1時間");
    expect(await snapshot(base)).toContain("14:00-15:00 要件定義");
    expect(reply).toBe("14:00-15:00 に「要件定義」を入れました。\n⚠ 「MTG」と重なっています");
  });

  it("時刻なしの追加：今からの最初の空きに入れる。明日は朝から", async () => {
    const { base, cal } = setup();
    expect(await run(cal, "散歩 30分")).toBe("15:30-16:00 に「散歩」を入れました。");
    expect(await run(cal, "明日 資料作成 2時間")).toBe("明日の07:00-09:00 に「資料作成」を入れました。");
    expect(await snapshot(base, "27")).toEqual(["07:00-09:00 資料作成"]);
  });

  it("空きが見つからなければ、何も変えずに AI に任せる", async () => {
    const { base, cal } = setup();
    await base.create({ title: "夕飯", start: jst("19:00"), end: jst("20:00") });
    expect(await run(cal, "大掃除 8時間")).toBeNull();
    expect(cal.ops).toHaveLength(0);
  });

  it("［元に戻す］で元どおり", async () => {
    const { base, cal } = setup();
    const before = await snapshot(base);
    await run(cal, "15分延長");
    await undoOps(base, cal.ops);
    expect(await snapshot(base)).toEqual(before);
  });
});

describe("ストイックの返事（コーチの口調）", () => {
  const stoic = (cal: RecordingCalendar, text: string) =>
    runCommand(parseCommand(text)!, cal, { tz, now, interrupt: { start: "now", mode: "slide" }, tone: "stoic" });
  const polite = /です|ます|ください|しょう/;

  it("追加・延長・スキップ・割り込みとも、敬語を使わず言い切る", async () => {
    const replies = [];
    for (const text of ["14時から要件定義1時間", "15分延長", "割り込み30分", "今のをスキップ"]) {
      const { cal } = setup();
      replies.push(await stoic(cal, text));
    }
    expect(replies[0]).toBe("14:00-15:00 に「要件定義」を入れた。始めたら、終わるまで離れるな。\n⚠ 「MTG」と重なっている");
    expect(replies[1]).toContain("「資料作成」を15分延長し、13:45 までにした。後ろの予定も15分ずらした（2件）。延長はこれで最後にしろ。");
    expect(replies[1]).toContain("⚠ ずらした「返信」が「MTG」と重なった");
    expect(replies[2]).toContain("済ませたら、すぐ戻れ。");
    expect(replies[3]).toBe("今の「資料作成」（12:30-13:30）を飛ばした。飛ばした分は、どこかで取り返せ。");
    for (const r of replies) expect(r).not.toMatch(polite);
  });

  it("やさしい（tone なし）は今までどおり丁寧語", async () => {
    const { cal } = setup();
    expect(await run(cal, "14時から要件定義1時間")).toBe("14:00-15:00 に「要件定義」を入れました。\n⚠ 「MTG」と重なっています");
  });
});
