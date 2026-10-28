import { beforeEach, describe, expect, it, vi } from "vitest";

// 偽の Claude：決まったひと言を返す
const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

const { withAiBudget } = await import("@/lib/budget");
const { QuoteError, cleanQuote, generateQuote } = await import("@/lib/quote");
const { MemoryStore } = await import("@/lib/store/memory");
const { timeSlot } = await import("@/lib/theme");

const tz = "Asia/Tokyo";
const date = "2026-10-31";
const now = new Date(`${date}T22:00:00+09:00`);
const reply = (text: string) => ({
  model: "claude-haiku-5-5",
  stop_reason: "end_turn",
  usage: { input_tokens: 300, output_tokens: 40 },
  content: [{ type: "text", text }],
});

beforeEach(() => create.mockReset());

describe("時間帯のひと言（AI の名言）", () => {
  it("いちばん安いモデルで作り、使った分を記録する（今日の予算の 0.1% 未満）", async () => {
    create.mockResolvedValue(reply("今日の汗は、明日の自分への投資だ。"));
    const store = new MemoryStore();
    const userId = crypto.randomUUID();
    const r = await withAiBudget({ store, userId, tz, now }, (meter) =>
      generateQuote(meter, { slot: "night", arc: { name: "WINTER ARC", day: 31, total: 92 }, recent: ["前のひと言。"] }),
    );
    expect(r.result).toBe("今日の汗は、明日の自分への投資だ。");
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.messages[0].content).toContain("夜（21時〜）");
    expect(params.messages[0].content).toContain("WINTER ARC（31日目 / 全92日）");
    expect(params.messages[0].content).toContain("- 前のひと言。");
    expect(await store.getCost(userId, date)).toBeGreaterThan(0);
    expect(r.costPercent).toBeLessThan(0.1);
  });

  it("かぎかっこ・引用符を外し、句点で終える。長すぎる答えは使わない", () => {
    expect(cleanQuote("「止まるな、進め」")).toBe("止まるな、進め。");
    expect(cleanQuote("\n\n“休むのも訓練だ。”\n（説明）")).toBe("休むのも訓練だ。");
    expect(() => cleanQuote("あ".repeat(41))).toThrow(QuoteError);
    expect(() => cleanQuote("")).toThrow(QuoteError);
  });

  it("時間帯：朝 5〜11時／昼 11〜17時／夕方 17〜21時／夜 21〜5時", () => {
    expect([4, 5, 10, 11, 16, 17, 20, 21, 0].map(timeSlot)).toEqual([
      "night",
      "morning",
      "morning",
      "day",
      "day",
      "evening",
      "evening",
      "night",
      "night",
    ]);
  });
});
