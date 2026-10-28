import { beforeEach, describe, expect, it, vi } from "vitest";

// Claude API をモックし、決まった応答（tool_use → end_turn）を順に返す。
// messages 配列は呼び出し後も追記されるので、リクエストはその時点の複製を記録する
const create = vi.fn();
const requests: { model: string; tool_choice?: unknown; messages: { content: never }[] }[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        create: (params: unknown) => {
          requests.push(structuredClone(params) as (typeof requests)[number]);
          return create(params);
        },
      },
    };
  },
}));

const { runAgent } = await import("@/lib/agent");
const { MemoryCalendar } = await import("@/lib/calendar/memory");
const { RecordingCalendar } = await import("@/lib/ops");

const now = new Date("2026-10-26T04:00:00Z"); // 13:00 JST

beforeEach(() => {
  create.mockReset();
  requests.length = 0;
});

describe("runAgent", () => {
  it("tool_use を実行して結果を返し、最終的な返答を返す", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "create_blocks",
            input: { blocks: [{ title: "要件定義", start: "2026-10-26T14:00+09:00", minutes: 60, energy: "HIGH" }] },
          },
        ],
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "14:00-15:00 要件定義 を入れました" }] });

    const calendar = new RecordingCalendar(new MemoryCalendar(crypto.randomUUID()));
    const { reply } = await runAgent({ message: "14時から要件定義1時間", history: [], calendar, tz: "Asia/Tokyo", now });

    expect(reply).toBe("14:00-15:00 要件定義 を入れました");
    expect(calendar.ops).toHaveLength(1);

    const first = requests[0];
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.tool_choice).toBeUndefined();
    expect(first.messages.at(-1)!.content).toContain("[現在時刻: 2026-10-26T13:00+09:00");

    // 2回目のリクエストには tool_result が1つのユーザーメッセージで入っている
    const second = requests[1];
    const toolResult = second.messages.at(-1)!.content[0] as { is_error?: boolean };
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(toolResult.is_error).toBeUndefined();
  });

  it("ツールのエラーは is_error で AI に返す", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "delete_block", input: { id: "missing" } }],
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "見つかりませんでした" }] });

    const calendar = new RecordingCalendar(new MemoryCalendar(crypto.randomUUID()));
    await runAgent({ message: "消して", history: [], calendar, tz: "Asia/Tokyo", now });
    expect(requests[1].messages.at(-1)!.content[0]).toMatchObject({ is_error: true });
  });

  it("refusal のときは定型文を返す", async () => {
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    const calendar = new RecordingCalendar(new MemoryCalendar(crypto.randomUUID()));
    const { reply } = await runAgent({ message: "x", history: [], calendar, tz: "Asia/Tokyo", now });
    expect(reply).toContain("お応えできません");
  });
});

describe("runAgent の認証エラー", () => {
  it("Google の接続切れ（UnauthorizedError）は AI に返さず、そのまま投げる", async () => {
    const { UnauthorizedError } = await import("@/lib/errors");
    create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "get_schedule", input: { from: "2026-10-26", to: "2026-10-26" } }],
    });
    const base = new MemoryCalendar(crypto.randomUUID());
    base.list = async () => {
      throw new UnauthorizedError("接続切れ");
    };
    const calendar = new RecordingCalendar(base);
    await expect(runAgent({ message: "予定は？", history: [], calendar, tz: "Asia/Tokyo", now })).rejects.toBeInstanceOf(UnauthorizedError);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("runAgent の費用の記録", () => {
  it("ツールを使ったやり取りも含めて、すべての回の費用を足す", async () => {
    const { CostMeter } = await import("@/lib/pricing");
    create
      .mockResolvedValueOnce({
        model: "claude-opus-5-5",
        stop_reason: "tool_use",
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [{ type: "tool_use", id: "t1", name: "get_schedule", input: { from: "2026-10-26", to: "2026-10-26" } }],
      })
      .mockResolvedValueOnce({ model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 2000, output_tokens: 50 }, content: [{ type: "text", text: "空いています" }] });
    const meter = new CostMeter();
    const calendar = new RecordingCalendar(new MemoryCalendar(crypto.randomUUID()));
    await runAgent({ message: "空いてる？", history: [], calendar, tz: "Asia/Tokyo", now, meter });
    expect(meter.usd).toBeCloseTo((3000 * 4 + 150 * 20) / 1e6, 10);
  });
});
