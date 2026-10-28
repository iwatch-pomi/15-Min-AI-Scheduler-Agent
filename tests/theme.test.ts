import { describe, expect, it } from "vitest";
import { arcProgress, defaultArc, isValidArc, parseTheme, shortDuration, stoicLine } from "@/lib/theme";

describe("挑戦（Winter Arc）の進み具合", () => {
  const arc = defaultArc("2026-10-31");

  it("初期値は WINTER ARC、10/1〜12/31 の92日", () => {
    expect(arc).toEqual({ name: "WINTER ARC", start: "2026-10-01", end: "2026-12-31" });
    expect(arcProgress(arc, "2026-10-31")).toMatchObject({ status: "active", day: 31, total: 92 });
    expect(arcProgress(arc, "2026-10-01")).toMatchObject({ status: "active", day: 1 });
    expect(arcProgress(arc, "2026-12-31")).toMatchObject({ status: "active", day: 92, ratio: 1 });
  });

  it("期間の前は「あと◯日」、後は完了", () => {
    expect(arcProgress(arc, "2026-09-28")).toEqual({ status: "before", total: 92, daysLeft: 3, ratio: 0 });
    expect(arcProgress(arc, "2027-01-01")).toEqual({ status: "done", total: 92, ratio: 1 });
  });

  it("うるう年の2月もまたげる", () => {
    expect(arcProgress({ name: "X", start: "2028-02-01", end: "2028-03-01" }, "2028-03-01")).toMatchObject({ day: 30, total: 30 });
  });

  it("名前が空・終了が開始より前・形式が違うものは無効", () => {
    expect(isValidArc({ name: "", start: "2026-10-01", end: "2026-12-31" })).toBe(false);
    expect(isValidArc({ name: "A", start: "2026-12-31", end: "2026-10-01" })).toBe(false);
    expect(isValidArc({ name: "A", start: "10/1", end: "2026-10-01" })).toBe(false);
    expect(isValidArc(null)).toBe(false);
    expect(isValidArc({ name: "A", start: "2026-10-01", end: "2026-10-01" })).toBe(true);
  });
});

describe("ストイックの表示", () => {
  it("時間帯のひと言：同じ日・同じ時間帯なら同じ文", () => {
    expect(stoicLine(22, "2026-10-31")).toBe(stoicLine(23, "2026-10-31"));
    expect(stoicLine(7, "2026-10-31")).not.toBe(stoicLine(22, "2026-10-31"));
    expect(["今日もやり切った。休むのも訓練。", "眠るまでが、今日のメニュー。", "明日の自分に、いいバトンを。"]).toContain(stoicLine(2, "2026-10-31"));
  });

  it("長さは 45m・1h30・8h", () => {
    expect(shortDuration(45)).toEqual({ value: "45", unit: "m" });
    expect(shortDuration(90)).toEqual({ value: "1h30", unit: "" });
    expect(shortDuration(480)).toEqual({ value: "8", unit: "h" });
  });

  it("cookie の値は stoic 以外はやさしい", () => {
    expect(parseTheme("stoic")).toBe("stoic");
    expect(parseTheme("soft")).toBe("soft");
    expect(parseTheme("x")).toBe("soft");
    expect(parseTheme(undefined)).toBe("soft");
  });
});
