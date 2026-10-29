import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CalendarIcon, ClockIcon, GaugeIcon, Mascot, RepeatIcon, SparkleIcon } from "@/components/icons";
import Scheduler from "@/components/Scheduler";
import { isDemo } from "@/lib/context";
import { LEGAL_DOCS } from "@/lib/legal";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { login } from "./actions";

// DEMO_MODE などの環境変数をビルド時ではなくリクエスト時に読む
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  if (isDemo()) return <Scheduler demo />;

  const { error } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    // ログイン画面もデザインごとに分ける（/arc から来た人・ストイックを選んだ人はストイック）
    const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
    const notice = error ? loginErrorText(String(error)) : null;
    return theme === "stoic" ? <SignInStoic notice={notice} /> : <SignInSoft notice={notice} />;
  }
  // ほかのタブで先にログインできていれば、エラーは気にせずそのまま使う（URL の ?error= を消す）
  if (error) redirect("/");
  return <Scheduler email={session.user.email ?? undefined} />;
}

const FEATURES = [
  { Icon: SparkleIcon, text: "AIにひと言で予定を作成" },
  { Icon: ClockIcon, text: "15分単位のタイムブロック" },
  { Icon: CalendarIcon, text: "Googleカレンダーと連携" },
];

/** Auth.js のエラーの種類を、ログイン画面に出す案内にする */
function loginErrorText(error: string): string {
  if (error === "AccessDenied") return "ログインがキャンセルされました。使うときは、もう一度［Google でログイン］を押してください。";
  return "ログインを完了できませんでした。2つのタブで同時にログインしたときなどに起こります。このタブで、もう一度［Google でログイン］を押してください。";
}

function LoginNotice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="rounded-xl bg-now/10 px-3 py-2.5 text-xs leading-relaxed text-now" role="alert" data-testid="login-error">
      {text}
    </p>
  );
}

const PERMISSION_NOTE =
  "ログインすると、Google カレンダーの予定の閲覧と、AI 専用カレンダー「AIスケジューラー」の作成・編集を許可します。メインのカレンダーは変更しません。";

/** やさしい：万人向けのログイン画面 */
function SignInSoft({ notice }: { notice: string | null }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-14" data-testid="signin-soft">
      <div className="space-y-5">
        <div className="flex items-end gap-3">
          <Mascot className="size-20" />
          <p className="mb-3 rounded-2xl rounded-bl-sm bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent-ink">一緒にがんばろう！</p>
        </div>
        <h1 className="text-[26px] font-bold leading-snug text-heading">
          AIが、あなたの毎日を
          <br />
          もっと<span className="text-accent-ink">スマート</span>に。
        </h1>
        <p className="text-sm leading-relaxed">
          予定の管理から、やることの整理まで。ひと言送るだけで、AI が15分刻みのスケジュールを組み立てます。
        </p>
      </div>

      <ul className="space-y-2.5">
        {FEATURES.map(({ Icon, text }) => (
          <li key={text} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-ink">
              <Icon className="size-5" />
            </span>
            <span className="text-sm font-medium text-heading">{text}</span>
          </li>
        ))}
      </ul>

      <LoginNotice text={notice} />
      <form action={login} className="space-y-3">
        <button
          type="submit"
          className="w-full rounded-full bg-accent px-5 py-3.5 font-bold text-on-accent shadow-[0_10px_24px_-10px_var(--accent)] transition active:scale-[0.99]"
        >
          Google でログイン
        </button>
        <p className="text-center text-xs text-muted">{PERMISSION_NOTE}</p>
      </form>
      <LegalLinks />
    </main>
  );
}

const STOIC_FEATURES = [
  { Icon: ClockIcon, label: "BLOCK", text: "15分単位のタイムブロック" },
  { Icon: GaugeIcon, label: "COACH", text: "ひと言で予定を組む AI コーチ" },
  { Icon: RepeatIcon, label: "ARC", text: "挑戦の日数と、時間の使い方の振り返り" },
];

/** ストイック：Winter Arc などに打ち込む人向けのログイン画面 */
function SignInStoic({ notice }: { notice: string | null }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-9 px-6 py-14" data-testid="signin-stoic">
      <div className="space-y-5">
        <p className="t-label flex items-center gap-2 text-accent-ink">
          <GaugeIcon className="size-5" strokeWidth={2} />
          15-MIN AI SCHEDULER
        </p>
        <h1 className="t-num text-[44px] font-bold leading-[1.1] tracking-[-0.03em] text-heading">
          時間を、
          <br />
          支配しよう。
        </h1>
        <p className="text-sm leading-relaxed text-muted">やることを投げれば、AI コーチが15分単位で組み込む。浪費した時間も、数字で見える。</p>
      </div>

      <ul className="divide-y divide-line-soft rounded-2xl bg-surface shadow-card">
        {STOIC_FEATURES.map(({ Icon, label, text }) => (
          <li key={label} className="flex items-center gap-3.5 px-4 py-3.5">
            <span className="grid size-[38px] shrink-0 place-items-center rounded-[10px] bg-surface-2 text-accent-ink">
              <Icon className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="t-label block text-[10px] text-muted">{label}</span>
              <span className="block text-sm font-bold text-heading">{text}</span>
            </span>
          </li>
        ))}
      </ul>

      <LoginNotice text={notice} />
      <form action={login} className="space-y-3">
        <button type="submit" className="h-12 w-full rounded-xl bg-accent font-bold text-on-accent transition active:scale-[0.99]">
          Google でログイン
        </button>
        <p className="text-center text-xs leading-relaxed text-muted">{PERMISSION_NOTE}</p>
      </form>
      <LegalLinks />
    </main>
  );
}

/** 規約などへのリンク（ログイン前でも見られる） */
function LegalLinks() {
  return (
    <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11px] text-muted" data-testid="legal-links">
      {LEGAL_DOCS.map((d) => (
        <Link key={d.slug} href={`/legal/${d.slug}`} className="underline">
          {d.title}
        </Link>
      ))}
    </nav>
  );
}
