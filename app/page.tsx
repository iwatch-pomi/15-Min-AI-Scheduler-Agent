import { auth } from "@/auth";
import { CalendarIcon, ClockIcon, Mascot, SparkleIcon } from "@/components/icons";
import Scheduler from "@/components/Scheduler";
import { isDemo } from "@/lib/context";
import { login } from "./actions";

// DEMO_MODE などの環境変数をビルド時ではなくリクエスト時に読む
export const dynamic = "force-dynamic";

export default async function Home() {
  if (isDemo()) return <Scheduler demo />;

  const session = await auth();
  if (!session?.user?.id) return <SignIn />;
  return <Scheduler email={session.user.email ?? undefined} />;
}

const FEATURES = [
  { Icon: SparkleIcon, text: "AIにひと言で予定を作成" },
  { Icon: ClockIcon, text: "15分単位のタイムブロック" },
  { Icon: CalendarIcon, text: "Googleカレンダーと連携" },
];

function SignIn() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-14">
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

      <form action={login} className="space-y-3">
        <button
          type="submit"
          className="w-full rounded-full bg-accent px-5 py-3.5 font-bold text-white shadow-[0_10px_24px_-10px_var(--accent)] transition active:scale-[0.99]"
        >
          Google でログイン
        </button>
        <p className="text-center text-xs text-muted">
          ログインすると、Google カレンダーの予定の閲覧と、AI 専用カレンダー「AIスケジューラー」の作成・編集を許可します。メインのカレンダーは変更しません。
        </p>
      </form>
    </main>
  );
}
