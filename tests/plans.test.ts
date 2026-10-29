import { describe, expect, it } from "vitest";
import {
  BRIEF_LEVELS,
  PAID_PLANS,
  PLANS,
  allowedMode,
  briefCostPercent,
  canUse,
  firstPlanWith,
  planFor,
  priceLabel,
  toPlan,
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

  it("AIブリーフは、無料・ライトが簡易版（Haiku）で1日1回、スタンダードとプロが詳しい版（Sonnet）で制限なし", () => {
    expect(PLANS.free).toMatchObject({ briefsPerDay: 1, brief: "simple" });
    expect(PLANS.plus).toMatchObject({ briefsPerDay: 1, brief: "simple" });
    expect(PLANS.standard).toMatchObject({ briefsPerDay: null, brief: "detailed" });
    expect(PLANS.pro).toMatchObject({ briefsPerDay: null, brief: "detailed" });
    expect(BRIEF_LEVELS.simple.model).toBe("light");
    expect(BRIEF_LEVELS.detailed.model).toBe("standard");
    expect(PLANS[firstPlanWith((r) => r.brief === "detailed")].label).toBe("スタンダード");
    // 1回で今日のAIの何%か（0%とは出さない）
    expect(briefCostPercent("free")).toBe(3);
    expect(briefCostPercent("plus")).toBe(1);
    expect(briefCostPercent("standard")).toBe(10);
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
  it("有料プランは3つ。安い順に並ぶ", () => {
    expect([...PAID_PLANS]).toEqual(["plus", "standard", "pro"]);
    const prices = PAID_PLANS.map((p) => PLANS[p].priceYen);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("スタンダードはプロとの差額が200円なのに、AI は半分以下で最大モードも無い", () => {
    expect(PLANS.pro.priceYen - PLANS.standard.priceYen).toBe(200);
    expect(PLANS.standard.monthlyUsd).toBeLessThanOrEqual(PLANS.pro.monthlyUsd / 2);
    expect(canUse("standard", "max")).toBe(false);
  });

  it("為替が1ドル200円・API が3割値上げ・決済手数料8%（Stripe 3.6% ＋ Managed Payments 3.5% に余裕）でも、AI を上限まで使われて赤字にならない", () => {
    for (const p of PAID_PLANS) {
      const income = PLANS[p].priceYen * 0.92;
      const aiCost = PLANS[p].monthlyUsd * 200 * 1.3;
      expect(income, p).toBeGreaterThan(aiCost);
    }
  });
});
