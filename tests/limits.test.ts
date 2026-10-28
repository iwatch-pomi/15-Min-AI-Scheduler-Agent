import { afterEach, describe, expect, it } from "vitest";
import { usageOf } from "@/lib/limits";
import { MemoryStore } from "@/lib/store/memory";

afterEach(() => {
  delete process.env.DAILY_CHAT_LIMIT;
});

describe("AI の残り回数", () => {
  it("使った回数だけ減り、0 より下にはならない", () => {
    process.env.DAILY_CHAT_LIMIT = "50";
    expect(usageOf(0)).toEqual({ used: 0, limit: 50, remaining: 50 });
    expect(usageOf(3)).toEqual({ used: 3, limit: 50, remaining: 47 });
    expect(usageOf(52)).toEqual({ used: 50, limit: 50, remaining: 0 });
  });

  it("保存先は日付ごとに数え、読むだけでは増えない", async () => {
    const store = new MemoryStore();
    const user = crypto.randomUUID();
    expect(await store.getUsage(user, "2026-10-28")).toBe(0);
    await store.incrementUsage(user, "2026-10-28");
    await store.incrementUsage(user, "2026-10-28");
    expect(await store.getUsage(user, "2026-10-28")).toBe(2);
    expect(await store.getUsage(user, "2026-10-29")).toBe(0);
  });
});
