import { NextResponse, type NextRequest } from "next/server";
import { getUserContext } from "@/lib/context";
import { rateLimit } from "@/lib/guards";
import { toChatEntries } from "@/lib/history";
import { errorResponse } from "@/lib/http";

const PAGE = 30;

// GET /api/messages?before=<id> → AI とのチャット履歴（古い順、結果カード付き）
export async function GET(req: NextRequest) {
  try {
    const before = req.nextUrl.searchParams.get("before");
    const { userId, store } = await getUserContext();
    const { messages, hasMore } = await store.listMessages(userId, {
      before: before && /^\d+$/.test(before) ? before : undefined,
      limit: PAGE,
    });
    const groupIds = [...new Set(messages.flatMap((m) => (m.opGroupId ? [m.opGroupId] : [])))];
    const groups = await store.getOpGroups(userId, groupIds);
    return NextResponse.json({ entries: toChatEntries(messages, groups), hasMore });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/messages → チャット履歴をすべて消す（カレンダーの予定はそのまま）
export async function DELETE() {
  try {
    const { userId, store } = await getUserContext();
    await rateLimit(store, userId, "write");
    await store.deleteMessages(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
