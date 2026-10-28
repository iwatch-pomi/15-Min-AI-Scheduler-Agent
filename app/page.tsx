import { auth } from "@/auth";
import { AppLogo, CalendarIcon, ClockIcon, SparkleIcon } from "@/components/icons";
import Scheduler from "@/components/Scheduler";
import { isDemo } from "@/lib/context";
import { dailyChatLimit } from "@/lib/limits";
import { login } from "./actions";

// DEMO_MODE などの環境変数をビルド時ではなくリクエスト時に読む
export const dynamic = "force-dynamic";

export default async function Home() {
  if (isDemo()) return <Scheduler demo dailyLimit={dailyChatLimit()} />;

  const session = await auth();
  if (!session?.user?.id) return <SignIn />;
  return <Scheduler email={session.user.email ?? undefined} dailyLimit={dailyChatLimit()} />;
}

const FEATURES = [
  { Icon: SparkleIcon, text: "AIにひと言で予定を作成" },
  { Icon: ClockIcon, text: "15分単位のタイムブロック" },
  { Icon: CalendarIcon, text: "Googleカレンダーと連携" },
];

function SignIn() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-14">
      <div className="space-y-4">
        <AppLogo className="size-16 rounded-2xl shadow-card" />
        <div>
          <p className="text-2xl font-bold leading-tight">15-Min AI Scheduler</p>
          <h1 className="mt-3 text-2xl font-bold leading-snug text-accent">
            ひと言で、
            <br />
            今日の予定が整う。
          </h1>
        </div>
        <p className="text-sm text-muted">
          AI秘書にひと言送るだけで、あなたの代わりに15分刻みのスケジュールを作成します。延長・割り込みもひと言で組み直し。
        </p>
      </div>

      <ul className="space-y-2.5">
        {FEATURES.map(({ Icon, text }) => (
          <li key={text} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-card">
            <span className="grid size-9 place-items-center rounded-full bg-accent text-white">
              <Icon className="size-5" />
            </span>
            <span className="text-sm font-medium">{text}</span>
          </li>
        ))}
      </ul>

      <form action={login} className="space-y-3">
        <button
          type="submit"
          className="w-full rounded-full bg-accent px-5 py-3.5 font-bold text-white shadow-card transition active:scale-[0.99]"
        >
          Google でログイン
        </button>
        <p className="text-center text-xs text-muted">
          ログインすると、Google カレンダーの予定の閲覧と、AI 専用カレンダー「15分スケジューラー」の作成・編集を許可します。メインのカレンダーは変更しません。
        </p>
      </form>
    </main>
  );
}
