import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { MemoryCalendar } = await import("@/lib/calendar/memory");
const { MemoryStore } = await import("@/lib/store/memory");
let userId = "";
let plan = "pro";
vi.mock("@/lib/context", () => ({
  getUserContext: async () => ({ userId, calendar: new MemoryCalendar(userId), store: new MemoryStore(), plan, accountTz: "Asia/Tokyo" }),
}));
const { GET, PUT } = await import("@/app/api/instructions/route");
const { normalizeInstructions, instructionsBlock } = await import("@/lib/custom-instructions");

const put = async (body: unknown) => {
  const res = await PUT(new Request("http://x/api/instructions", { method: "PUT", body: JSON.stringify(body) }) as unknown as NextRequest);
  return { status: res.status, data: await res.json() };
};

beforeEach(() => {
  userId = crypto.randomUUID();
  plan = "pro";
});

describe("AI へのカスタム指示", () => {
  it("空白を整え、500字までにする。空なら指示なし", () => {
    expect(normalizeInstructions("  朝は集中\r\n\n\n\n夜は休む  ")).toBe("朝は集中\n\n夜は休む");
    expect(normalizeInstructions("あ".repeat(600))).toHaveLength(500);
    expect(normalizeInstructions("   ")).toBeNull();
    expect(normalizeInstructions(null)).toBeNull();
  });

  it("保存すると、ほかの端末で開いても同じ指示が返る。消すこともできる", async () => {
    expect(await (await GET()).json()).toEqual({ text: null, allowed: true });
    expect((await put({ text: "22時以降は予定を入れないで" })).data).toEqual({ text: "22時以降は予定を入れないで" });
    expect(await (await GET()).json()).toEqual({ text: "22時以降は予定を入れないで", allowed: true });
    expect((await put({ text: null })).data).toEqual({ text: null });
    expect(await (await GET()).json()).toEqual({ text: null, allowed: true });
    expect((await put({ text: 1 })).status).toBe(400);
  });

  it("無料プランでは保存できない（403）。前に保存した指示を消すことはできる", async () => {
    await new MemoryStore().saveCustomInstructions(userId, "朝は勉強");
    plan = "free";
    expect(await (await GET()).json()).toEqual({ text: "朝は勉強", allowed: false });
    const r = await put({ text: "夜は休む" });
    expect(r.status).toBe(403);
    expect(r.data.error).toBe("カスタム指示は有料プラン（ライトから）で使えます");
    expect(await new MemoryStore().getCustomInstructions(userId)).toBe("朝は勉強");
    expect((await put({ text: null })).status).toBe(200);
    expect(await new MemoryStore().getCustomInstructions(userId)).toBeNull();
  });

  it("AI には、決まりを優先することを添えて渡す", () => {
    const block = instructionsBlock("返事は短く");
    expect(block).toContain("<custom_instructions>\n返事は短く\n</custom_instructions>");
    expect(block).toContain("上の決まりを優先する");
  });
});
