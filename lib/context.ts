import { auth } from "@/auth";
import { GoogleCalendar } from "./calendar/google";
import { MemoryCalendar } from "./calendar/memory";
import type { CalendarBackend } from "./calendar/types";
import { demoSeed, isDemo } from "./demo";
import { DEFAULT_TZ } from "./time";
import { MemoryStore } from "./store/memory";
import { SupabaseStore } from "./store/supabase";
import type { Store } from "./store/types";
import { UnauthorizedError } from "./errors";
import { toPlan, type Plan } from "./plans";
import { clearAiCalendarId, getGoogleAccount, saveAiCalendarId } from "./users";

export { UnauthorizedError };

export { isDemo };

export type UserContext = {
  userId: string;
  calendar: CalendarBackend;
  store: Store;
  plan: Plan;
  /**
   * AI の使用量・「AIで更新」の回数を数える日付のタイムゾーン（アカウントに保存したもの）。
   * 画面から送られる tz は使わない（tz を変えて送り、1日の上限を2日分使う、を防ぐ）
   */
  accountTz: string;
};

/**
 * API ルートから呼ぶ。ログイン中のユーザーのカレンダーと保存先を返す。
 * DEMO_MODE=1 のときはログインなしでメモリ上のカレンダーを使う。
 */
export async function getUserContext(): Promise<UserContext> {
  if (isDemo()) {
    const userId = "demo";
    // デモのプランは DEMO_PLAN（free / plus / standard / pro）で切り替えられる。既定はすべて使えるプロ
    const plan = process.env.DEMO_PLAN ? toPlan(process.env.DEMO_PLAN) : "pro";
    return { userId, calendar: new MemoryCalendar(userId, demoSeed()), store: new MemoryStore(), plan, accountTz: DEFAULT_TZ };
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new UnauthorizedError("ログインしてください");
  const account = await getGoogleAccount(userId);
  if (!account.refreshToken) throw new UnauthorizedError("Google カレンダーの権限がありません。もう一度ログインしてください");
  const calendar = new GoogleCalendar(
    account.refreshToken,
    account.aiCalendarId,
    { save: (id) => saveAiCalendarId(userId, id), clear: (id) => clearAiCalendarId(userId, id) },
    account.timezone,
  );
  return { userId, calendar, store: new SupabaseStore(), plan: account.plan, accountTz: account.timezone };
}
