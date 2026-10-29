import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, SERVICE, legalDoc } from "@/lib/legal";

// 規約などのページ。ログインしていなくても見られる

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ doc: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const doc = legalDoc((await params).doc);
  return { title: doc ? `${doc.title}｜${SERVICE}` : SERVICE };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const doc = legalDoc((await params).doc);
  if (!doc) notFound();
  return (
    <main className="mx-auto max-w-xl px-5 py-10" data-testid={`legal-${doc.slug}`}>
      <Link href="/" className="text-sm font-bold text-accent-ink">
        ← {SERVICE}
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-heading">{doc.title}</h1>
      <div className="mt-6 divide-y divide-line-soft overflow-hidden rounded-2xl bg-surface shadow-card">
        {doc.sections.map((s) => (
          <section key={s.heading} className="space-y-1.5 px-4 py-3.5">
            <h2 className="text-sm font-bold text-heading">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p} className="text-sm leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        {LEGAL_DOCS.filter((d) => d.slug !== doc.slug).map((d) => (
          <Link key={d.slug} href={`/legal/${d.slug}`} className="underline">
            {d.title}
          </Link>
        ))}
      </nav>
    </main>
  );
}
