import { describe, expect, it } from "vitest";
import {
  PAID_PLANS,
  PLANS,
  allowedMode,
  bestValuePlan,
  briefCostPercent,
  canUse,
  firstPlanWith,
  planFor,
  priceLabel,
  toPlan,
  upsellOf,
  yenPerChat,
} from "@/lib/plans";

describe("プランごとの決まり", () => {
  it("無料は節約だけ、ライト・スタンダードは強化まで、最大（Opus）はプロだけ", () => {
    expect(PLANS.free.modes).toEqual(["save"]);
    expect(canUse("plus", "boost")).toBe(true);
    expect(canUse("standard", "boost")).toBe(true);
    expect(canUse("standard", "max")).toBe(false);
    expect(canUse("pro", "max")).toBe(true);
    expect(planFor("normal")).toBe("plus");
    expect(planFor("boost")).toBe("plus");
    expect(planFor("max")).toBe("pro");
    expect(planFor("save")).toBe("free");
  });

  it("使えないモードは、使えるいちばん上のモードに下げる", () => {
    expect(allowedMode("free", "max")).toBe("save");
    expect(allowedMode("free", "normal")).toBe("save");
    expect(allowedMode("plus", "max")).toBe("boost");
    expect(allowedMode("standard", "max")).toBe("boost");
    expect(allowedMode("pro", "max")).toBe("max");
  });

  it("広告は、無料が多め（全画面あり）、ライトが少なめ、スタンダード・プロはなし", () => {
    expect(PAID_PLANS.map((p) => PLANS[p].ads)).toEqual(["light", "none", "none"]);
    expect(PLANS.free.ads).toBe("full");
    expect(PLANS[firstPlanWith((r) => r.ads === "none")].label).toBe("スタンダード");
  });

  it("AIブリーフは、無料は使えない・ライトは1日1回・スタンダードとプロは制限なし", () => {
    expect(PLANS.free.briefsPerDay).toBe(0);
    expect(PLANS.plus.briefsPerDay).toBe(1);
    expect(PLANS.standard.briefsPerDay).toBeNull();
    expect(PLANS.pro.briefsPerDay).toBeNull();
    expect(briefCostPercent("plus")).toBe(20);
  });

  it("カスタム指示は有料だけ", () => {
    expect(PLANS.free.customInstructions).toBe(false);
    for (const p of PAID_PLANS) expect(PLANS[p].customInstructions).toBe(true);
  });

  it("無料の AI は1日 $0.03・月 $0.3。1日の予算は、月の予算÷30より多い", () => {
    expect(PLANS.free).toMatchObject({ dailyUsd: 0.03, monthlyUsd: 0.3 });
    for (const p of Object.values(PLANS)) expect(p.dailyUsd).toBeGreaterThan(p.monthlyUsd / 30);
  });

  it("読めない値は無料にし、値段は円で出す", () => {
    expect(toPlan("pro")).toBe("pro");
    expect(toPlan("standard")).toBe("standard");
    expect(toPlan("gold")).toBe("free");
    expect(toPlan(null)).toBe("free");
    expect(priceLabel("plus")).toBe("480円/月");
    expect(priceLabel("standard")).toBe("1,780円/月");
    expect(priceLabel("pro")).toBe("1,980円/月");
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

  it("スタンダードはプロとの差額が200円なのに、AI は半分以下で最大モードも無い", () => {
    const up = upsellOf("standard")!;
    expect(up).toEqual({ to: "pro", diffYen: 200, aiTimes: 2, newModes: ["max"] });
    expect(PLANS.standard.monthlyUsd).toBeLessThanOrEqual(PLANS.pro.monthlyUsd / 2);
    expect(upsellOf("plus")).toBeNull();
    expect(upsellOf("pro")).toBeNull();
  });

  it("AI 1回あたりの値段。広告なしのプランの中では、プロがいちばん安い", () => {
    expect(PAID_PLANS.map((p) => yenPerChat(p))).toEqual([8, 18, 9]);
    expect(yenPerChat("free")).toBeNull();
    expect(bestValuePlan()).toBe("pro");
  });

  it("為替が1ドル200円・API が3割値上げ・決済手数料5%でも、AI を上限まで使われて赤字にならない", () => {
    for (const p of PAID_PLANS) {
      const income = PLANS[p].priceYen * 0.95;
      const aiCost = PLANS[p].monthlyUsd * 200 * 1.3;
      expect(income, p).toBeGreaterThan(aiCost);
    }
  });
});
