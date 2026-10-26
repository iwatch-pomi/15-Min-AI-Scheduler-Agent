import { describe, expect, it } from "vitest";
import { assignLanes, freeSlots, planShift } from "@/lib/slots";
import type { Block } from "@/lib/types";

const t = (hhmm: string) => `2026-10-26T${hhmm}:00.000Z`;
const block = (id: string, s: string, e: string, ai = true): Block => ({ id, title: id, start: t(s), end: t(e), ai });

describe("freeSlots", () => {
  it("予定の間の空きを返し、15分未満の隙間は捨てる", () => {
    const blocks = [block("a", "09:00", "10:00"), block("b", "10:10", "11:00"), block("c", "12:00", "12:30")];
    const free = freeSlots(blocks, new Date(t("08:00")), new Date(t("13:00")));
    expect(free.map((s) => [s.start.toISOString(), s.end.toISOString()])).toEqual([
      [t("08:00"), t("09:00")],
      [t("11:00"), t("12:00")],
      [t("12:30"), t("13:00")],
    ]);
  });

  it("重なっている予定もまとめて塞ぐ", () => {
    const blocks = [block("a", "09:00", "10:30"), block("b", "10:00", "11:00")];
    const free = freeSlots(blocks, new Date(t("09:00")), new Date(t("12:00")));
    expect(free).toHaveLength(1);
    expect(free[0].start.toISOString()).toBe(t("11:00"));
  });
});

describe("planShift", () => {
  it("指定時刻以降の AI ブロックだけをずらし、既存予定は動かさない", () => {
    const blocks = [
      block("before", "08:00", "08:30"),
      block("ai1", "09:00", "09:30"),
      block("meeting", "10:00", "11:00", false),
      block("ai2", "11:00", "11:15"),
    ];
    const plan = planShift(blocks, new Date(t("09:00")), 15);
    expect(plan.map((p) => [p.block.id, p.start.toISOString()])).toEqual([
      ["ai1", t("09:15")],
      ["ai2", t("11:15")],
    ]);
  });

  it("until より後に始まるブロックは対象外", () => {
    const blocks = [block("ai1", "09:00", "09:30"), block("ai2", "20:00", "20:30")];
    expect(planShift(blocks, new Date(t("09:00")), 30, new Date(t("12:00")))).toHaveLength(1);
  });
});

describe("assignLanes", () => {
  it("重なる予定を別レーンに並べる", () => {
    const lanes = assignLanes([block("a", "09:00", "10:00"), block("b", "09:30", "10:30"), block("c", "11:00", "11:30")]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get("c")).toEqual({ lane: 0, lanes: 1 });
  });
});
