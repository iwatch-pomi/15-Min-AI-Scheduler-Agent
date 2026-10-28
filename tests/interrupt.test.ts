import { describe, expect, it } from "vitest";
import { MemoryCalendar } from "@/lib/calendar/memory";
import { applyInterrupt, interruptReply, parseInterrupt, type InterruptSettings } from "@/lib/interrupt";
import { RecordingCalendar, undoOps } from "@/lib/ops";
import type { Block } from "@/lib/types";

const tz = "Asia/Tokyo";
const now = new Date("2026-10-26T04:05:00Z"); // 13:05 JST
const jst = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00+09:00`).toISOString();
const hm = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

function setup(seed?: Block[]) {
  const base = new MemoryCalendar(crypto.randomUUID(), seed ?? [
    { id: "ai-a", title: "資料作成", start: jst("12:30"), end: jst("13:30"), ai: true, energy: "HIGH" },
    { id: "ai-b", title: "返信", start: jst("13:30"), end: jst("14:00"), ai: true, energy: "LOW" },
    { id: "mtg", title: "MTG", start: jst("14:30"), end: jst("15:00"), ai: false },
    { id: "ai-c", title: "レビュー", start: jst("15:00"), end: jst("15:30"), ai: true },
    { id: "gym", title: "ジム", start: jst("18:00"), end: jst("19:00"), ai: true, routine: true },
  ]);
  return { base, cal: new RecordingCalendar(base) };
}

async function snapshot(base: MemoryCalendar) {
  const list = await base.list(new Date(jst("00:00")), new Date(jst("23:59")));
  return list.map((b) => `${hm(b.start)}-${hm(b.end)} ${b.title}`);
}

const run = (cal: RecordingCalendar, title: string, minutes: number, s: InterruptSettings) =>
  applyInterrupt(cal, { title, minutes, tz, now, ...s });

describe("parseInterrupt", () => {
  it.each([
    ["45分買い物", "買い物", 45],
    ["買い物 1時間", "買い物", 60],
    ["1時間半 散歩", "散歩", 90],
    ["1時間30分 散歩", "散歩", 90],
    ["電話30分", "電話", 30],
    ["２０分 休憩", "休憩", 30],
    ["買い物を45分くらい", "買い物", 45],
    ["30分", "割り込み", 30],
  ])("%s → %s %i分", (text, title, minutes) => {
    expect(parseInterrupt(text)).toEqual({ title, minutes });
  });

  it("長さが読めなければ null（AI に頼む）", () => {
    expect(parseInterrupt("コンビニに行く")).toBeNull();
  });

  it("最大8時間", () => {
    expect(parseInterrupt("10時間 引っ越し")?.minutes).toBe(480);
  });
});

describe("applyInterrupt", () => {
  it("スライド：進行中の予定を切って続きを後ろに置き、後ろの AI の予定をずらす", async () => {
    const { base, cal } = setup();
    const r = await run(cal, "買い物", 45, { start: "now", mode: "slide" });
    expect(await snapshot(base)).toEqual([
      "12:30-13:15 資料作成",
      "13:15-14:00 買い物",
      "14:00-14:15 資料作成（続き）",
      "14:15-14:45 返信",
      "14:30-15:00 MTG",
      "15:45-16:15 レビュー",
      "18:00-19:00 ジム",
    ]);
    expect(r).toMatchObject({ moved: 2, trimmed: 1, continued: 1 });
    expect(r.warnings).toEqual(["ずらした「返信」が「MTG」（メインの予定）と重なりました"]);
    expect(interruptReply(r, "slide", tz)).toContain("13:15-14:00 に「買い物」を割り込ませました");
  });

  it("今の予定の直後：進行中の予定が終わってから始める", async () => {
    const { base, cal } = setup();
    await run(cal, "買い物", 30, { start: "after_current", mode: "slide" });
    expect(await snapshot(base)).toEqual([
      "12:30-13:30 資料作成",
      "13:30-14:00 買い物",
      "14:00-14:30 返信",
      "14:30-15:00 MTG",
      "15:30-16:00 レビュー",
      "18:00-19:00 ジム",
    ]);
  });

  it("削る：丸ごと重なる予定は削除し、そのあとの予定は動かさない", async () => {
    const { base, cal } = setup();
    const r = await run(cal, "買い物", 45, { start: "now", mode: "trim" });
    expect(await snapshot(base)).toEqual([
      "12:30-13:15 資料作成",
      "13:15-14:00 買い物",
      "14:30-15:00 MTG",
      "15:00-15:30 レビュー",
      "18:00-19:00 ジム",
    ]);
    expect(r).toMatchObject({ trimmed: 1, deleted: 1 });
    expect(interruptReply(r, "trim", tz)).toContain("重なった予定を1件を短く、1件を削除しました");
  });

  it("削る：後ろだけ重なる予定は始まりを遅らせる", async () => {
    const { base, cal } = setup();
    await run(cal, "電話", 30, { start: "now", mode: "trim" });
    expect((await snapshot(base)).slice(0, 3)).toEqual(["12:30-13:15 資料作成", "13:15-13:45 電話", "13:45-14:00 返信"]);
  });

  it("削る：割り込みをまたぐ予定は、前半を残して後半を続きにする", async () => {
    const { base, cal } = setup([{ id: "long", title: "勉強", start: jst("12:00"), end: jst("15:00"), ai: true }]);
    const r = await run(cal, "買い物", 45, { start: "now", mode: "trim" });
    expect(await snapshot(base)).toEqual(["12:00-13:15 勉強", "13:15-14:00 買い物", "14:00-15:00 勉強（続き）"]);
    expect(r).toMatchObject({ trimmed: 1, continued: 1 });
  });

  it("ルーティンとメインの予定は動かさず、重なったら知らせる", async () => {
    const { base, cal } = setup([
      { id: "mtg", title: "MTG", start: jst("13:30"), end: jst("14:00"), ai: false },
      { id: "gym", title: "ジム", start: jst("13:45"), end: jst("14:30"), ai: true, routine: true },
    ]);
    const r = await run(cal, "買い物", 60, { start: "now", mode: "trim" });
    expect(await snapshot(base)).toEqual(["13:15-14:15 買い物", "13:30-14:00 MTG", "13:45-14:30 ジム"]);
    expect(r.warnings).toHaveLength(2);
  });

  it.each(["slide", "trim"] as const)("%s：［元に戻す］で元どおり", async (mode) => {
    const { base, cal } = setup();
    const before = await snapshot(base);
    await run(cal, "買い物", 45, { start: "now", mode });
    await undoOps(base, cal.ops);
    expect(await snapshot(base)).toEqual(before);
  });
});
