import { auth } from "@/auth";
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

function SignIn() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-sm font-medium text-accent">15-Min AI Scheduler</p>
        <h1 className="text-3xl font-bold leading-tight">
          話しかけるだけで、
          <br />
          今日が15分単位で決まる。
        </h1>
        <p className="text-muted">
          「14時から要件定義1時間、そのあと問い合わせ返信」と送るだけで、AI が Google カレンダーの空き時間に組み込みます。延長・割り込みもひと言で組み直し。
        </p>
      </div>
      <form action={login}>
        <button
          type="submit"
          className="w-full rounded-xl bg-accent px-5 py-3.5 font-medium text-white shadow-sm transition active:scale-[0.99]"
        >
          Google でログイン
        </button>
      </form>
      <p className="text-xs text-muted">ログインすると、Google カレンダーの予定の閲覧と、このアプリによる予定の追加・変更を許可します。</p>
    </main>
  );
}
