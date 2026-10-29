import { AI_MODES, type AiMode } from "./interrupt";

// プラン（無料／ライト／スタンダード／プロ）ごとの決まり。金額・上限・使えるモードは、ここだけを書き換えれば変わる

export type Plan = "free" | "plus" | "standard" | "pro";
/** 安い順。上のプランほど後ろ（Stripe で複数の契約があるときは、後ろのものを採る） */
export const PLAN_IDS: Plan[] = ["free", "plus", "standard", "pro"];
/** お金を払うプラン（Stripe で申し込む） */
export type PaidPlan = Exclude<Plan, "free">;
export const PAID_PLANS = ["plus", "standard", "pro"] as const satisfies readonly PaidPlan[];

export type PlanRule = {
  label: string;
  /** ストイックで出す英語の名前 */
  en: string;
  /** 画面に出す短い説明 */
  tagline: string;
  /** 月の料金（円）。無料は 0 */
  priceYen: number;
  /** 1か月の AI の予算（米ドル）。毎月1日の0時に戻る */
  monthlyUsd: number;
  /** 1日の AI の予算（米ドル）。使わない日の分を使う日に回せるよう、月÷30 より多めにする */
  dailyUsd: number;
  /** AI を使える回数の目安（通常モード・1か月。依頼の内容で変わる） */
  monthlyChats: number;
  /** AI を使える回数の目安（画面に出す文） */
  guide: string;
  /** 使える AI の使い方（モード） */
  modes: AiMode[];
  /** 広告を出すか */
  ads: boolean;
  /** 「AIで更新」（AIブリーフ）を1日に何回まで使えるか。null は上限なし（AI の予算の範囲で） */
  briefsPerDay: number | null;
  /** 比べたときに、いちばんおすすめのプラン */
  recommended?: boolean;
  /** このプランの中で「あと少しの差額で、こちらにできる」と案内する上のプラン */
  upsell?: Plan;
};

/** AIブリーフ1回のおおよその費用（米ドル。いつも Sonnet で作る）。画面で「今日のAIの◯割」と出すのに使う */
export const BRIEF_COST_USD = 0.02;

// 値段の並べ方：スタンダードは、プロと200円しか違わないのに AI は半分以下で、最大モードも無い。
// 並べて比べると、プロがいちばんお得に見える（スタンダードが選ばれても、AI の費用に対して黒字になる）
export const PLANS: Record<Plan, PlanRule> = {
  free: {
    label: "無料",
    en: "FREE",
    tagline: "広告あり・AIはお試し程度",
    priceYen: 0,
    monthlyUsd: 0.5,
    dailyUsd: 0.05,
    monthlyChats: 25,
    guide: "1日2〜3回・月25回ほど",
    modes: ["save", "normal"],
    ads: true,
    briefsPerDay: 1,
  },
  plus: {
    label: "ライト",
    en: "LITE",
    tagline: "広告なし・強化モード（Sonnet）も使える",
    priceYen: 480,
    monthlyUsd: 1.2,
    dailyUsd: 0.1,
    monthlyChats: 60,
    guide: "1日5回・月60回ほど",
    modes: ["save", "normal", "boost"],
    ads: false,
    briefsPerDay: null,
  },
  standard: {
    label: "スタンダード",
    en: "STANDARD",
    tagline: "広告なし・AIをもう少し使える",
    priceYen: 1280,
    monthlyUsd: 2,
    dailyUsd: 0.2,
    monthlyChats: 100,
    guide: "1日10回・月100回ほど",
    modes: ["save", "normal", "boost"],
    ads: false,
    briefsPerDay: null,
    upsell: "pro",
  },
  pro: {
    label: "プロ",
    en: "PRO",
    tagline: "広告なし・AIたっぷり・最大モード（Opus）も使える",
    priceYen: 1480,
    monthlyUsd: 4.5,
    dailyUsd: 0.5,
    monthlyChats: 220,
    guide: "1日25回・月220回ほど",
    modes: ["save", "normal", "boost", "max"],
    ads: false,
    briefsPerDay: null,
    recommended: true,
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

/** AIブリーフ1回で、そのプランの今日のAIのおよそ何％を使うか（10％単位） */
export function briefCostPercent(plan: Plan): number {
  return Math.round((BRIEF_COST_USD / PLANS[plan].dailyUsd) * 10) * 10;
}

/** AI 1回あたりのおおよその値段（円。月の料金 ÷ 月の回数の目安）。無料は null */
export function yenPerChat(plan: Plan): number | null {
  const { priceYen, monthlyChats } = PLANS[plan];
  return priceYen ? Math.round(priceYen / monthlyChats) : null;
}

/** 1回あたりがいちばん安い有料プラン */
export function bestValuePlan(): PaidPlan {
  return [...PAID_PLANS].sort((a, b) => PLANS[a].priceYen / PLANS[a].monthlyChats - PLANS[b].priceYen / PLANS[b].monthlyChats)[0];
}

/** 上のプランへの案内（「あと200円で、AIが2倍以上」）に使う、差額と AI の量の倍率 */
export function upsellOf(plan: Plan): { to: Plan; diffYen: number; aiTimes: number; newModes: AiMode[] } | null {
  const to = PLANS[plan].upsell;
  if (!to) return null;
  const from = PLANS[plan];
  const target = PLANS[to];
  return {
    to,
    diffYen: target.priceYen - from.priceYen,
    // 「2.25倍」は「2倍以上」と出したいので、小数は切り捨てる
    aiTimes: Math.floor(target.monthlyUsd / from.monthlyUsd),
    newModes: target.modes.filter((m) => !from.modes.includes(m)),
  };
}
