import { describe, expect, it } from "vitest";
import { suggestions } from "@/lib/suggest";
import type { Block } from "@/lib/types";
import { iconFor } from "@/lib/ui";

const tz = "Asia/Tokyo";
const date = "2026-10-28";
const jst = (hhmm: string) => new Date(`${date}T${hhmm}:00+09:00`);
const b = (id: string, s: string, e: string, ai = false): Block => ({ id, title: id, start: jst(s).toISOString(), end: jst(e).toISOString(), ai });
const run = (events: Block[], now: string, extra: Partial<Parameters<typeof suggestions>[0]> = {}) =>
  suggestions({ date, tz, now: jst(now), today: date, events, ...extra });

describe("suggestions", () => {
  it("今以降のまとまった空き時間を出し、タップ時の依頼文も作る", () => {
    const s = run([b("授業", "09:00", "12:00"), b("実験", "13:00", "16:30")], "10:00");
    const free = s.find((x) => x.id === "free")!;
    expect(free.text).toContain("12:00〜13:00");
    expect(free.prompt).toBe("今日の12:00から60分で、");
  });

  it("60分未満の隙間は空き時間として出さない", () => {
    const s = run([b("a", "08:00", "12:00"), b("b", "12:30", "22:00")], "08:00");
    expect(s.find((x) => x.id === "free")).toBeUndefined();
  });

  it("150分以上続く予定のあと、空いていれば休憩をすすめる", () => {
    const s = run([b("授業", "09:00", "10:30"), b("実験", "10:30", "12:00")], "08:00");
    expect(s.find((x) => x.id === "break")?.prompt).toBe("12:00から15分の休憩を入れて");
  });

  it("AI の予定がまだない日は、組み立てをすすめる", () => {
    expect(run([b("x", "09:00", "10:00")], "08:00").some((x) => x.id === "plan")).toBe(true);
    expect(run([b("x", "09:00", "10:00", true)], "08:00").some((x) => x.id === "plan")).toBe(false);
  });

  it("18時以降で明日に AI の予定がなければ、明日の準備をすすめる", () => {
    const s = run([b("x", "09:00", "10:00", true)], "19:00", { tomorrow: [] });
    expect(s.find((x) => x.id === "tomorrow")?.prompt).toBe("明日（10月29日）やりたいこと：");
  });

  it("過去の日には何も出さず、最大3件まで", () => {
    expect(suggestions({ date: "2026-10-27", tz, now: jst("10:00"), today: date, events: [] })).toEqual([]);
    expect(run([b("a", "08:00", "10:30"), b("b", "10:30", "11:00")], "19:00", { tomorrow: [] }).length).toBeLessThanOrEqual(3);
  });
});

describe("iconFor", () => {
  it("タイトルからアイコンを選ぶ", () => {
    expect(iconFor({ title: "昼食", ai: false })).toBe("meal");
    expect(iconFor({ title: "朝の準備・朝食", ai: false })).toBe("coffee");
    expect(iconFor({ title: "授業：生物工学", ai: false })).toBe("study");
    expect(iconFor({ title: "研究室ミーティング", ai: false })).toBe("meeting");
    expect(iconFor({ title: "実験：培養確認", ai: false })).toBe("lab");
    expect(iconFor({ title: "データ整理・レポート作成", ai: true })).toBe("work");
    expect(iconFor({ title: "ジム", ai: false })).toBe("gym");
    expect(iconFor({ title: "ランチ", ai: false })).toBe("meal");
    expect(iconFor({ title: "なにか", ai: true })).toBe("ai");
    expect(iconFor({ title: "なにか", ai: false })).toBe("event");
  });
});

describe("isUndoRequest", () => {
  it("「元に戻して」だけの依頼は AI を呼ばずに取り消す", async () => {
    const { isUndoRequest } = await import("@/lib/ui");
    for (const m of ["元に戻して", "もとに戻して。", "さっきのを元に戻して", "取り消して", "やっぱりやめて！", "元に戻してください", " 今のを 取り消して "]) {
      expect(isUndoRequest(m), m).toBe(true);
    }
  });

  it("対象や条件がある依頼は AI に任せる", async () => {
    const { isUndoRequest } = await import("@/lib/ui");
    for (const m of ["会議の前の予定を元に戻して", "15時の課題を取り消して", "元に戻して、そのあと30分延長", "元の時間に戻して"]) {
      expect(isUndoRequest(m), m).toBe(false);
    }
  });
});
