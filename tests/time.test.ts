import { describe, expect, it } from "vitest";
import { dayRange, parseTimeInput, snapToSlot, toLocalIso, zonedToUtc } from "@/lib/time";

describe("time", () => {
  it("東京のローカル時刻を UTC に変換する", () => {
    expect(zonedToUtc("2026-10-26", 13, 0, "Asia/Tokyo").toISOString()).toBe("2026-10-26T04:00:00.000Z");
  });

  it("夏時間のあるタイムゾーンでもオフセットを正しく扱う", () => {
    expect(zonedToUtc("2026-07-01", 9, 0, "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-12-01", 9, 0, "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });

  it("1日の範囲を返す", () => {
    const { start, end } = dayRange("2026-10-26", "Asia/Tokyo");
    expect(start.toISOString()).toBe("2026-10-25T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-26T15:00:00.000Z");
  });

  it("オフセット付きのローカル ISO に整形する", () => {
    expect(toLocalIso(new Date("2026-10-26T04:00:00Z"), "Asia/Tokyo")).toBe("2026-10-26T13:00+09:00");
  });

  it("オフセットなしの時刻はユーザーの tz として解釈する", () => {
    expect(parseTimeInput("2026-10-26T13:00", "Asia/Tokyo")?.toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(parseTimeInput("2026-10-26T13:00+09:00", "UTC")?.toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(parseTimeInput("あした", "Asia/Tokyo")).toBeNull();
  });

  it("15分単位に丸める", () => {
    expect(snapToSlot(new Date("2026-10-26T04:07:00Z")).toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(snapToSlot(new Date("2026-10-26T04:08:00Z")).toISOString()).toBe("2026-10-26T04:15:00.000Z");
  });
});
