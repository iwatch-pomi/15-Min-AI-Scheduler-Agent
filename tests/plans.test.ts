import { describe, expect, it } from "vitest";
import { PLANS, allowedMode, canUse, planFor, priceLabel, toPlan } from "@/lib/plans";

describe("プランごとの決まり", () => {
  it("無料は節約・通常、有料1は強化まで、最大（Opus）は有料2だけ", () => {
    expect(PLANS.free.modes).toEqual(["save", "normal"]);
    expect(canUse("plus", "boost")).toBe(true);
    expect(canUse("plus", "max")).toBe(false);
    expect(canUse("pro", "max")).toBe(true);
    expect(planFor("max")).toBe("pro");
    expect(planFor("boost")).toBe("plus");
    expect(planFor("save")).toBe("free");
  });

  it("使えないモードは、使えるいちばん上のモードに下げる", () => {
    expect(allowedMode("free", "max")).toBe("normal");
    expect(allowedMode("free", "boost")).toBe("normal");
    expect(allowedMode("free", "save")).toBe("save");
    expect(allowedMode("plus", "max")).toBe("boost");
    expect(allowedMode("pro", "max")).toBe("max");
  });

  it("広告は無料だけ。1日の予算は、月の予算÷30より多い", () => {
    expect(PLANS.free.ads).toBe(true);
    expect(PLANS.plus.ads).toBe(false);
    expect(PLANS.pro.ads).toBe(false);
    for (const p of Object.values(PLANS)) expect(p.dailyUsd).toBeGreaterThan(p.monthlyUsd / 30);
  });

  it("読めない値は無料にし、値段は円で出す", () => {
    expect(toPlan("pro")).toBe("pro");
    expect(toPlan("gold")).toBe("free");
    expect(toPlan(null)).toBe("free");
    expect(priceLabel("plus")).toBe("480円/月");
    expect(priceLabel("pro")).toBe("1,480円/月");
    expect(priceLabel("free")).toBe("0円");
  });
});
