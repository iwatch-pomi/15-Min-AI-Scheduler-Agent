import { auth } from "@/auth";
import { GoogleCalendar } from "./calendar/google";
import { MemoryCalendar } from "./calendar/memory";
import type { CalendarBackend } from "./calendar/types";
import { demoSeed } from "./demo";
import { MemoryStore } from "./store/memory";
import { SupabaseStore } from "./store/supabase";
import type { Store } from "./store/types";
import { getRefreshToken } from "./users";

export const isDemo = () => process.env.DEMO_MODE === "1";

export type UserContext = { userId: string; calendar: CalendarBackend; store: Store };

export class UnauthorizedError extends Error {}

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
  const refreshToken = await getRefreshToken(userId);
  if (!refreshToken) throw new UnauthorizedError("Google カレンダーの権限がありません。もう一度ログインしてください");
  return { userId, calendar: new GoogleCalendar(refreshToken), store: new SupabaseStore() };
}
