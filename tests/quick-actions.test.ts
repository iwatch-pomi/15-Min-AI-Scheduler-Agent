import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { MemoryCalendar } = await import("@/lib/calendar/memory");
const { MemoryStore } = await import("@/lib/store/memory");
let userId = "";
vi.mock("@/lib/context", () => ({
  getUserContext: async () => ({ userId, calendar: new MemoryCalendar(userId), store: new MemoryStore(), plan: "pro" }),
}));
const { GET, PUT } = await import("@/app/api/quick-actions/route");
const { DEFAULT_QUICK_ACTIONS, normalizeQuickActions } = await import("@/lib/quick-actions");
const { worksWithoutAi } = await import("@/components/QuickActionsEditor");

const get = async () => (await GET()).json();
const put = async (body: unknown) => {
  const res = await PUT(new Request("http://x/api/quick-actions", { method: "PUT", body: JSON.stringify(body) }) as unknown as NextRequest);
  return { status: res.status, data: await res.json() };
};

beforeEach(() => {
  userId = crypto.randomUUID();
});

describe("クイックボタン", () => {
  it("空・重複・長すぎるものを除き、8個までにそろえる", () => {
    expect(normalizeQuickActions(["  30分延長 ", "", "30分延長", "あ".repeat(31), "今のをスキップ", 1])).toEqual(["30分延長", "今のをスキップ"]);
    expect(normalizeQuickActions(Array.from({ length: 12 }, (_, i) => `${i + 1}分延長`))).toHaveLength(8);
  });

  it("まだ決めていなければ初期値。保存すると、ほかの端末で開いても同じものが返る", async () => {
    expect(await get()).toEqual({ actions: DEFAULT_QUICK_ACTIONS, saved: false });
    const { data } = await put({ actions: ["30分延長", "今のをスキップ", "昼休み 45分", "30分延長"] });
    expect(data.actions).toEqual(["30分延長", "今のをスキップ", "昼休み 45分"]);
    // 別の端末＝新しく読み込んでも同じ
    expect(await get()).toEqual({ actions: ["30分延長", "今のをスキップ", "昼休み 45分"], saved: true });
  });

  it("全部消すこともできる。形の違う入力は 400", async () => {
    expect((await put({ actions: [] })).data.actions).toEqual([]);
    expect((await get()).actions).toEqual([]);
    expect((await put({ actions: "15分延長" })).status).toBe(400);
    expect((await put({})).status).toBe(400);
  });

  it("「AIなし」の判定：節約モードでアプリが処理できる言葉か", () => {
    expect(["15分延長", "割り込み30分", "今のをスキップ", "元に戻して", "14時から会議1時間"].map(worksWithoutAi)).toEqual([true, true, true, true, true]);
    expect(worksWithoutAi("今日の残りを組み直して")).toBe(false);
  });
});
