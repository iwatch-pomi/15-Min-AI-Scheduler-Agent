import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { CONTACT_ERRORS, CONTACT_LIMITS, contactSchema, hashIp, notifyContact, type ContactError, type ContactRecord } from "@/lib/contact";
import { isDemo } from "@/lib/demo";
import { MemoryStore } from "@/lib/store/memory";
import { SupabaseStore } from "@/lib/store/supabase";

// POST /api/contact → お問い合わせを受け付ける。ログインしていなくても送れる（紹介ページのフォームからも届く）。
// フォーム（JS なし）から届いたときは、結果を /contact に移って見せる。JSON で届いたときは JSON で返す

export async function POST(req: NextRequest) {
  const isForm = !(req.headers.get("content-type") ?? "").includes("application/json");
  const raw: Record<string, unknown> | null = isForm
    ? await req.formData().then((f) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"))).catch(() => null)
    : await req.json().catch(() => null);
  const source = typeof raw?.source === "string" ? raw.source : "app";

  const done = (error: ContactError | null) => {
    if (!isForm) return error ? NextResponse.json({ error: CONTACT_ERRORS[error] }, { status: error === "invalid" ? 400 : error === "failed" ? 500 : 429 }) : NextResponse.json({ ok: true });
    const url = new URL("/contact", req.url);
    url.searchParams.set(error ? "error" : "sent", error ?? "1");
    if (source === "lp" || source === "lp-arc") url.searchParams.set("from", source);
    return NextResponse.redirect(url, 303);
  };

  // 人には見えない欄（website）に入力があれば、機械による送信とみなす。気づかれないよう、送れたように見せる
  if (raw && typeof raw.website === "string" && raw.website.trim() !== "") return done(null);
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return done("invalid");

  try {
    const store = isDemo() ? new MemoryStore() : new SupabaseStore();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const ipHash = hashIp(ip);
    const now = Date.now();
    if ((await store.countContacts(new Date(now - 60 * 60_000), ipHash)) >= CONTACT_LIMITS.perHour) return done("too_many");
    if ((await store.countContacts(new Date(now - 24 * 60 * 60_000))) >= CONTACT_LIMITS.perDay) {
      console.error("お問い合わせが1日の上限に達したため、受け付けを止めています");
      return done("busy");
    }
    // ログインしていれば、誰からのお問い合わせか分かるように残す（返事のときにアカウントを確かめられる）
    const session = isDemo() ? null : await auth().catch(() => null);
    const record: ContactRecord = { ...parsed.data, userId: session?.user?.id ?? null, ipHash, createdAt: new Date(now).toISOString() };
    await store.saveContact(record);
    // メールで知らせられなくても、保存はできているので受け付けたことにする
    await notifyContact(record).catch((err) => console.error("お問い合わせのメールを送れませんでした", err));
    return done(null);
  } catch (err) {
    console.error("お問い合わせを保存できませんでした（schema.sql の更新が必要かもしれません）", err);
    return done("failed");
  }
}
