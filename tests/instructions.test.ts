import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { MemoryCalendar } = await import("@/lib/calendar/memory");
const { MemoryStore } = await import("@/lib/store/memory");
let userId = "";
vi.mock("@/lib/context", () => ({
  getUserContext: async () => ({ userId, calendar: new MemoryCalendar(userId), store: new MemoryStore() }),
}));
const { GET, PUT } = await import("@/app/api/instructions/route");
const { normalizeInstructions, instructionsBlock } = await import("@/lib/custom-instructions");

const put = async (body: unknown) => {
  const res = await PUT(new Request("http://x/api/instructions", { method: "PUT", body: JSON.stringify(body) }) as unknown as NextRequest);
  return { status: res.status, data: await res.json() };
};

beforeEach(() => {
  userId = crypto.randomUUID();
});

describe("AI へのカスタム指示", () => {
  it("空白を整え、500字までにする。空なら指示なし", () => {
    expect(normalizeInstructions("  朝は集中\r\n\n\n\n夜は休む  ")).toBe("朝は集中\n\n夜は休む");
    expect(normalizeInstructions("あ".repeat(600))).toHaveLength(500);
    expect(normalizeInstructions("   ")).toBeNull();
    expect(normalizeInstructions(null)).toBeNull();
  });

  it("保存すると、ほかの端末で開いても同じ指示が返る。消すこともできる", async () => {
    expect(await (await GET()).json()).toEqual({ text: null });
    expect((await put({ text: "22時以降は予定を入れないで" })).data).toEqual({ text: "22時以降は予定を入れないで" });
    expect(await (await GET()).json()).toEqual({ text: "22時以降は予定を入れないで" });
    expect((await put({ text: null })).data).toEqual({ text: null });
    expect(await (await GET()).json()).toEqual({ text: null });
    expect((await put({ text: 1 })).status).toBe(400);
  });

  it("AI には、決まりを優先することを添えて渡す", () => {
    const block = instructionsBlock("返事は短く");
    expect(block).toContain("<custom_instructions>\n返事は短く\n</custom_instructions>");
    expect(block).toContain("上の決まりを優先する");
  });
});
