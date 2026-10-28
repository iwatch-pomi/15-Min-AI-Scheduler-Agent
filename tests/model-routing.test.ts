import { describe, expect, it } from "vitest";
import { isHardRequest, modelFor, modelLabel } from "@/lib/claude";

describe("節約モードで Sonnet に回す難しい依頼", () => {
  it.each([
    "今日の残りを組み直して",
    "午後の予定を整理して",
    "全部1時間ずつ後ろにして",
    "今週のレポートの計画を立てて",
    "14時から要件定義1時間、そのあと返信15分",
    "会議30分と資料作成2時間を入れて",
    "要件定義を分解して入れて",
  ])("%s → 難しい", (m) => {
    expect(isHardRequest(m)).toBe(true);
  });

  it.each(["ちょっとコンビニ", "夜にレポート", "明日の午前に資料作成2時間", "ジムをスキップ", "15時の会議を16時に動かして"])("%s → Haiku でよい", (m) => {
    expect(isHardRequest(m)).toBe(false);
  });

  it("長い依頼（60字を超える）も難しいとみなす", () => {
    expect(isHardRequest("あ".repeat(61))).toBe(true);
  });

  it("モードとモデル", () => {
    expect(modelFor("save", "夜にレポート")).toBe("claude-haiku-5-5");
    expect(modelFor("save", "今日の残りを組み直して")).toBe("claude-sonnet-5-5");
    expect(modelFor("save")).toBe("claude-haiku-5-5");
    expect(modelFor("normal", "夜にレポート")).toBe("claude-sonnet-5-5");
    expect(modelFor("boost", "夜にレポート")).toBe("claude-opus-5-5");
    expect(modelFor(undefined)).toBe("claude-sonnet-5-5");
    expect(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"].map(modelLabel)).toEqual(["Haiku", "Sonnet", "Opus"]);
  });
});
