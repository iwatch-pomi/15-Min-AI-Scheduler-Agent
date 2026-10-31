import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { CONTACT_CATEGORIES, CONTACT_ERRORS, CONTACT_SOURCES, MAX_CONTACT_LENGTH, type ContactError, type ContactSource } from "@/lib/contact";
import { isDemo } from "@/lib/demo";
import { LEGAL_DOCS, OPERATOR, SERVICE } from "@/lib/legal";

// お問い合わせのページ。ログインしていなくても使える（紹介ページからも来る）。
// フォームは JS なしで送れる（/api/contact が受け付けて、このページに戻す）

export const metadata: Metadata = { title: `お問い合わせ｜${SERVICE}` };
export const dynamic = "force-dynamic";

type Params = { sent?: string; error?: string; from?: string };

export default async function ContactPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const source: ContactSource = (CONTACT_SOURCES as readonly string[]).includes(params.from ?? "") ? (params.from as ContactSource) : "app";
  const error = params.error && params.error in CONTACT_ERRORS ? CONTACT_ERRORS[params.error as ContactError] : null;
  // ログインしていれば、メールアドレスを入れておく
  const session = isDemo() ? null : await auth().catch(() => null);
  const email = session?.user?.email ?? "";
  const back = source === "lp" ? { href: "/lp", label: "紹介ページ" } : source === "lp-arc" ? { href: "/lp/arc", label: "紹介ページ" } : { href: "/", label: SERVICE };

  return (
    <main className="mx-auto max-w-xl px-5 py-10" data-testid="contact-page">
      <Link href={back.href} className="text-sm font-bold text-accent-ink">
        ← {back.label}
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-heading">お問い合わせ</h1>

      {params.sent ? (
        <div className="mt-6 space-y-3 rounded-2xl bg-surface px-5 py-6 shadow-card" data-testid="contact-sent" role="status">
          <p className="text-base font-bold text-heading">お問い合わせを受け付けました。</p>
          <p className="text-sm leading-relaxed">
            内容を確認し、ご入力いただいたメールアドレスにご連絡します。お返事まで数日いただくことがあります。しばらくたっても届かないときは、迷惑メールのフォルダもご確認ください。
          </p>
          <Link href={back.href} className="inline-block pt-1 text-sm font-bold text-accent-ink">
            {back.label}に戻る
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed">
            使い方のご質問・不具合のご報告・お支払いについてなど、お気軽にお送りください。ご入力いただいたメールアドレスにお返事します。
          </p>
          {error && (
            <p className="mt-4 rounded-xl bg-now/10 px-3 py-2.5 text-sm leading-relaxed text-now" role="alert" data-testid="contact-error">
              {error}
            </p>
          )}
          <form action="/api/contact" method="post" className="mt-6 space-y-4 rounded-2xl bg-surface px-5 py-5 shadow-card" data-testid="contact-form">
            <input type="hidden" name="source" value={source} />
            {/* 人には見えない欄。機械による送信だけが入力する（入っていれば受け付けない） */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                ウェブサイト（入力しないでください）
                <input type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <Field label="お名前" note="任意">
              <input name="name" maxLength={50} autoComplete="name" className={INPUT} />
            </Field>
            <Field label="メールアドレス" note="必須">
              <input name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={email} className={INPUT} data-testid="contact-email" />
            </Field>
            <Field label="お問い合わせの種類" note="必須">
              <select name="category" required defaultValue="usage" className={INPUT} data-testid="contact-category">
                {Object.entries(CONTACT_CATEGORIES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="内容" note={`必須・${MAX_CONTACT_LENGTH}字まで`}>
              <textarea name="message" required maxLength={MAX_CONTACT_LENGTH} rows={7} className={`${INPUT} leading-relaxed`} data-testid="contact-message" />
            </Field>
            <p className="text-xs leading-relaxed text-muted">
              不具合のご報告は、起きた日時・使っている端末（iPhone・Android・パソコン）・どの画面で何をしたかを書いていただけると、早く確かめられます。パスワードやカードの番号は書かないでください。
            </p>
            <button type="submit" className="h-12 w-full rounded-full bg-accent font-bold text-on-accent stoic:rounded-xl" data-testid="contact-submit">
              送信する
            </button>
            <p className="text-[11px] leading-relaxed text-muted">
              送信すると、
              <Link href="/legal/privacy" className="underline">
                プライバシーポリシー
              </Link>
              に同意したものとします。お問い合わせの内容は、お返事と、サービスの改善のためだけに使います。
            </p>
          </form>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            フォームが使えないときは、{OPERATOR.email} までメールでお送りください。
          </p>
        </>
      )}

      <nav className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        {LEGAL_DOCS.map((d) => (
          <Link key={d.slug} href={`/legal/${d.slug}`} className="underline">
            {d.title}
          </Link>
        ))}
      </nav>
    </main>
  );
}

const INPUT = "w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[16px] text-heading outline-none focus:border-accent stoic:rounded-[10px]";

function Field({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline gap-2 text-sm font-bold text-heading">
        {label}
        <span className="text-[11px] font-normal text-muted">{note}</span>
      </span>
      {children}
    </label>
  );
}
