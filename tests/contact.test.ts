import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// お問い合わせ（/api/contact）。データベースはメモリで代わりにする
vi.mock("@/lib/store/supabase", async () => ({ SupabaseStore: (await import("@/lib/store/memory")).MemoryStore }));
let session: { user: { id: string; email: string } } | null = null;
vi.mock("@/auth", () => ({ auth: async () => session }));

const { POST } = await import("@/app/api/contact/route");
const { MemoryStore } = await import("@/lib/store/memory");
const { CONTACT_LIMITS, hashIp, notifyContact } = await import("@/lib/contact");

let ip = "";
const valid = { email: "user@example.com", category: "bug", message: "予定が保存されません", name: "山田" };
const asJson = (body: unknown) =>
  POST(new Request("http://x/api/contact", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) }) as unknown as NextRequest);
const asForm = (body: Record<string, string>) =>
  POST(new Request("http://x/api/contact", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, body: new URLSearchParams(body) }) as unknown as NextRequest);
const saved = () => new MemoryStore().countContacts(new Date(0), hashIp(ip));

beforeEach(() => {
  ip = `203.0.113.${Math.floor(Math.random() * 250)}-${crypto.randomUUID()}`;
  session = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("お問い合わせの受け付け", () => {
  it("JSON で送ると保存し、ok を返す。IP アドレスはそのまま残さない", async () => {
    const res = await asJson(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await saved()).toBe(1);
    expect(hashIp(ip)).not.toContain("203.0.113");
  });

  it("紹介ページのフォーム（JS なし）から送ると、お礼のページに移る", async () => {
    const res = await asForm({ ...valid, source: "lp-arc" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://x/contact?sent=1&from=lp-arc");
    expect(await saved()).toBe(1);
  });

  it("入力がおかしければ、保存せずにフォームに戻す", async () => {
    const res = await asForm({ ...valid, email: "not-an-email", source: "lp" });
    expect(res.headers.get("location")).toBe("http://x/contact?error=invalid&from=lp");
    expect((await asJson({ ...valid, message: "x".repeat(2001) })).status).toBe(400);
    expect((await asJson({ ...valid, category: "spam" })).status).toBe(400);
    expect(await saved()).toBe(0);
  });

  it("人には見えない欄に入力があれば、送れたように見せて保存しない（機械による送信）", async () => {
    const res = await asForm({ ...valid, website: "https://spam.example" });
    expect(res.headers.get("location")).toBe("http://x/contact?sent=1");
    expect(await saved()).toBe(0);
  });

  it("同じ送り元からは1時間に5件まで", async () => {
    for (let i = 0; i < CONTACT_LIMITS.perHour; i++) expect((await asJson(valid)).status).toBe(200);
    const res = await asForm(valid);
    expect(res.headers.get("location")).toBe("http://x/contact?error=too_many");
    expect(await saved()).toBe(CONTACT_LIMITS.perHour);
  });

  it("全体で1日の上限に達したら、受け付けを止める", async () => {
    // 全体の件数だけが上限に達している
    const count = vi.spyOn(MemoryStore.prototype, "countContacts").mockImplementation(async (_since, ipHash) => (ipHash === undefined ? CONTACT_LIMITS.perDay : 0));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await asJson(valid);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("集中") });
    count.mockRestore();
    err.mockRestore();
  });

  it("ログインしていれば、誰からかを残す", async () => {
    session = { user: { id: "user-1", email: "a@example.com" } };
    const save = vi.spyOn(MemoryStore.prototype, "saveContact");
    await asJson(valid);
    expect(save.mock.calls[0][0]).toMatchObject({ userId: "user-1", email: "user@example.com", category: "bug", source: "app" });
    save.mockRestore();
  });
});

describe("運営者へのメール", () => {
  const record = { ...valid, category: "bug" as const, source: "lp" as const, userId: null, ipHash: "h", createdAt: "2026-10-31T00:00:00.000Z" };

  it("設定が無ければ送らない", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await notifyContact(record)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("設定があれば Resend で送り、返信先はお問い合わせした人にする", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("CONTACT_FROM_EMAIL", "support@example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await notifyContact({ ...record, message: "本文\n2行目" })).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ from: "support@example.com", to: ["iwase.workslab@gmail.com"], reply_to: "user@example.com" });
    expect(body.subject).not.toMatch(/[\r\n]/);
    expect(body.text).toContain("本文\n2行目");
  });

  it("メールを送れなくても、受け付け自体は成功にする（保存はできている）", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("CONTACT_FROM_EMAIL", "support@example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("err", { status: 500 })));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await asJson(valid)).status).toBe(200);
    expect(await saved()).toBe(1);
    err.mockRestore();
  });
});
