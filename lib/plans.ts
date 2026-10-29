import { AI_MODES, type AiMode } from "./interrupt";

// プラン（無料／有料1／有料2）ごとの決まり。金額・上限・使えるモードは、ここだけを書き換えれば変わる

export type Plan = "free" | "plus" | "pro";
export const PLAN_IDS: Plan[] = ["free", "plus", "pro"];
/** お金を払うプラン（Stripe で申し込む） */
export type PaidPlan = Exclude<Plan, "free">;

export type PlanRule = {
  label: string;
  /** 画面に出す短い説明 */
  tagline: string;
  /** 月の料金（円）。無料は 0 */
  priceYen: number;
  /** 1か月の AI の予算（米ドル）。毎月1日の0時に戻る */
  monthlyUsd: number;
  /** 1日の AI の予算（米ドル）。使わない日の分を使う日に回せるよう、月÷30 より多めにする */
  dailyUsd: number;
  /** AI を使える回数の目安（通常モード。依頼の内容で変わる） */
  guide: string;
  /** 使える AI の使い方（モード） */
  modes: AiMode[];
  /** 広告を出すか */
  ads: boolean;
};

export const PLANS: Record<Plan, PlanRule> = {
  free: {
    label: "無料",
    tagline: "広告あり・AIはお試し程度",
    priceYen: 0,
    monthlyUsd: 0.5,
    dailyUsd: 0.05,
    guide: "1日2〜3回・月25回ほど",
    modes: ["save", "normal"],
    ads: true,
  },
  plus: {
    label: "有料1",
    tagline: "広告なし・強化モード（Sonnet）も使える",
    priceYen: 480,
    monthlyUsd: 1.2,
    dailyUsd: 0.1,
    guide: "1日5回・月60回ほど",
    modes: ["save", "normal", "boost"],
    ads: false,
  },
  pro: {
    label: "有料2",
    tagline: "広告なし・AIたっぷり・最大モード（Opus）も使える",
    priceYen: 1480,
    monthlyUsd: 4.5,
    dailyUsd: 0.5,
    guide: "1日25回・月220回ほど",
    modes: ["save", "normal", "boost", "max"],
    ads: false,
  },
};

export function isPlan(v: unknown): v is Plan {
  return typeof v === "string" && (PLAN_IDS as string[]).includes(v);
}

/** 保存された値をプランにする。読めないもの・無いものは無料 */
export function toPlan(v: unknown): Plan {
  return isPlan(v) ? v : "free";
}

export function canUse(plan: Plan, mode: AiMode): boolean {
  return PLANS[plan].modes.includes(mode);
}

/** そのプランで使えないモードは、使えるいちばん上のモードに下げる（画面だけに頼らず、サーバーでも必ず通す） */
export function allowedMode(plan: Plan, mode: AiMode): AiMode {
  if (canUse(plan, mode)) return mode;
  const below = AI_MODES.slice(0, AI_MODES.indexOf(mode)).filter((m) => canUse(plan, m));
  return below.at(-1) ?? PLANS[plan].modes[0];
}

/** そのモードが使える、いちばん安いプラン */
export function planFor(mode: AiMode): Plan {
  return PLAN_IDS.find((p) => canUse(p, mode)) ?? "pro";
}

/** 画面に出す値段（「480円/月」） */
export function priceLabel(plan: Plan): string {
  const yen = PLANS[plan].priceYen;
  return yen ? `${yen.toLocaleString("ja-JP")}円/月` : "0円";
}
