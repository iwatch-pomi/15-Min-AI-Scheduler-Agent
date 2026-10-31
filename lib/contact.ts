import { createHash } from "node:crypto";
import { z } from "zod";
import { OPERATOR, SERVICE } from "./legal";

// お問い合わせ（アプリのマイページ・紹介ページのフォームから）。ログインしていなくても送れる。
// 内容は Supabase の contacts に保存し、メールの設定（RESEND_API_KEY）があれば運営者にも知らせる

export const CONTACT_CATEGORIES = {
  usage: "使い方について",
  bug: "不具合の報告",
  billing: "お支払い・プランについて",
  other: "そのほか",
} as const;
export type ContactCategory = keyof typeof CONTACT_CATEGORIES;

/** どこから送ったか（app＝アプリ、lp＝やさしい向けの紹介ページ、lp-arc＝ストイック向けの紹介ページ） */
export const CONTACT_SOURCES = ["app", "lp", "lp-arc"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const MAX_CONTACT_LENGTH = 2000;

export const contactSchema = z.object({
  name: z.string().trim().max(50, "お名前は50字までです").optional().default(""),
  email: z.string().trim().max(254).pipe(z.email("メールアドレスを正しく入力してください")),
  category: z.enum(Object.keys(CONTACT_CATEGORIES) as [ContactCategory, ...ContactCategory[]]),
  message: z.string().trim().min(1, "内容を入力してください").max(MAX_CONTACT_LENGTH, `内容は${MAX_CONTACT_LENGTH}字までです`),
  source: z.enum(CONTACT_SOURCES).optional().default("app"),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type ContactRecord = ContactInput & { userId: string | null; ipHash: string; createdAt: string };

/**
 * いたずら・大量の送信を止める決まり。
 * 送り元（IP アドレスをそのまま残さず、ハッシュにしたもの）ごとに1時間で perHour 件、全体で1日 perDay 件まで
 */
export const CONTACT_LIMITS = { perHour: 5, perDay: 200 };

/** 送れなかった理由 → 画面に出す文（/contact の error= で渡す） */
export const CONTACT_ERRORS = {
  invalid: `入力の内容を確かめてください。メールアドレスと内容は必ず入力してください（内容は${MAX_CONTACT_LENGTH}字まで）。`,
  too_many: "続けてたくさん送られたため、受け付けられませんでした。しばらくしてから、もう一度お試しください。",
  busy: "ただいまお問い合わせが集中しているため、受け付けられませんでした。時間をおいて、もう一度お試しください。",
  failed: "送信できませんでした。時間をおいて、もう一度お試しください。",
} as const;
export type ContactError = keyof typeof CONTACT_ERRORS;

/** IP アドレスは保存せず、秘密の値と合わせたハッシュだけを残す（同じ送り元かどうかが分かれば足りる） */
export function hashIp(ip: string, secret = process.env.AUTH_SECRET ?? ""): string {
  return createHash("sha256").update(`${secret}:${ip}`).digest("hex").slice(0, 32);
}

/** 届いたお問い合わせを、運営者にメールで知らせる（Resend）。設定が無ければ何もしない */
export async function notifyContact(c: ContactRecord): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!key || !from) return false;
  const to = process.env.CONTACT_TO_EMAIL || OPERATOR.email;
  // 件名に改行が入らないようにする
  const subject = `【${SERVICE}】お問い合わせ：${CONTACT_CATEGORIES[c.category]}`.replace(/[\r\n]/g, " ");
  const text = [
    `種類：${CONTACT_CATEGORIES[c.category]}`,
    `お名前：${c.name || "（なし）"}`,
    `メールアドレス：${c.email}`,
    `送った場所：${{ app: "アプリ", lp: "紹介ページ（やさしい）", "lp-arc": "紹介ページ（ストイック）" }[c.source]}`,
    `ログイン：${c.userId ? `あり（${c.userId}）` : "なし"}`,
    `日時：${c.createdAt}`,
    "",
    c.message,
  ].join("\n");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to: c.email, subject, text }),
  });
  if (!res.ok) throw new Error(`お問い合わせのメールを送れませんでした（${res.status}）`);
  return true;
}
