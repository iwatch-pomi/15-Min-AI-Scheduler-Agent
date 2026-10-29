import { describe, expect, it } from "vitest";
import { PAID_PLANS, PLANS, allowedMode, bestValuePlan, briefCostPercent, canUse, planFor, priceLabel, toPlan, upsellOf, yenPerChat } from "@/lib/plans";

describe("プランごとの決まり", () => {
  it("無料は節約・通常、ライト・スタンダードは強化まで、最大（Opus）はプロだけ", () => {
    expect(canUse("standard", "boost")).toBe(true);
    expect(canUse("standard", "max")).toBe(false);
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
    expect(allowedMode("standard", "max")).toBe("boost");
    expect(allowedMode("pro", "max")).toBe("max");
  });

  it("広告は無料だけ。1日の予算は、月の予算÷30より多い", () => {
    expect(PLANS.free.ads).toBe(true);
    expect(PLANS.plus.ads).toBe(false);
    expect(PLANS.pro.ads).toBe(false);
    for (const p of Object.values(PLANS)) expect(p.dailyUsd).toBeGreaterThan(p.monthlyUsd / 30);
  });

  it("AIブリーフは無料だけ1日1回。1回で今日のAIの約4割を使う", () => {
    expect(PLANS.free.briefsPerDay).toBe(1);
    expect(PLANS.plus.briefsPerDay).toBeNull();
    expect(PLANS.pro.briefsPerDay).toBeNull();
    expect(briefCostPercent("free")).toBe(40);
  });

  it("読めない値は無料にし、値段は円で出す", () => {
    expect(toPlan("pro")).toBe("pro");
    expect(toPlan("gold")).toBe("free");
    expect(toPlan(null)).toBe("free");
    expect(priceLabel("plus")).toBe("480円/月");
    expect(priceLabel("standard")).toBe("1,280円/月");
    expect(priceLabel("pro")).toBe("1,480円/月");
    expect(toPlan("standard")).toBe("standard");
    expect(priceLabel("free")).toBe("0円");
  });
});

describe("値段の並べ方（プロを選びたくなる形）", () => {
  it("有料プランは3つ。安い順に並び、プロだけがおすすめ", () => {
    expect([...PAID_PLANS]).toEqual(["plus", "standard", "pro"]);
    const prices = PAID_PLANS.map((p) => PLANS[p].priceYen);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(PAID_PLANS.filter((p) => PLANS[p].recommended)).toEqual(["pro"]);
  });

  it("スタンダードはプロとの差額が小さいのに、AI は半分以下で最大モードも無い", () => {
    const up = upsellOf("standard")!;
    expect(up).toEqual({ to: "pro", diffYen: 200, aiTimes: 2, newModes: ["max"] });
    expect(PLANS.standard.monthlyUsd).toBeLessThanOrEqual(PLANS.pro.monthlyUsd / 2);
    expect(up.diffYen).toBeLessThan(PLANS.pro.priceYen * 0.2);
    expect(upsellOf("plus")).toBeNull();
    expect(upsellOf("pro")).toBeNull();
  });

  it("AI 1回あたりの値段は、プロがいちばん安い", () => {
    expect(PAID_PLANS.map((p) => yenPerChat(p))).toEqual([8, 13, 7]);
    expect(yenPerChat("free")).toBeNull();
    expect(bestValuePlan()).toBe("pro");
  });

  it("どの有料プランも、AI を上限まで使われても赤字にならない（1ドル160円・決済手数料4%で見積もり）", () => {
    for (const p of PAID_PLANS) expect(PLANS[p].priceYen * 0.96).toBeGreaterThan(PLANS[p].monthlyUsd * 160);
  });
});
