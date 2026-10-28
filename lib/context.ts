import { auth } from "@/auth";
import { GoogleCalendar } from "./calendar/google";
import { MemoryCalendar } from "./calendar/memory";
import type { CalendarBackend } from "./calendar/types";
import { demoSeed, isDemo } from "./demo";
import { MemoryStore } from "./store/memory";
import { SupabaseStore } from "./store/supabase";
import type { Store } from "./store/types";
import { UnauthorizedError } from "./errors";
import { clearAiCalendarId, getGoogleAccount, saveAiCalendarId } from "./users";

export { UnauthorizedError };

export { isDemo };

export type UserContext = { userId: string; calendar: CalendarBackend; store: Store };

/**
 * API ルートから呼ぶ。ログイン中のユーザーのカレンダーと保存先を返す。
 * DEMO_MODE=1 のときはログインなしでメモリ上のカレンダーを使う。
 */
export async function getUserContext(): Promise<UserContext> {
  if (isDemo()) {
    const userId = "demo";
    return { userId, calendar: new MemoryCalendar(userId, demoSeed()), store: new MemoryStore() };
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
  return { userId, calendar, store: new SupabaseStore() };
}
