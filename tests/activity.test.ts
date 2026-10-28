import { describe, expect, it } from "vitest";
import { editNote, isActivity, undoNote } from "@/lib/activity";
import { noteText, toChatEntries } from "@/lib/history";
import { MemoryStore } from "@/lib/store/memory";
import type { ChangeItem } from "@/lib/ui";

const tz = "Asia/Tokyo";
const item = (title: string, s: string, e: string, kind: ChangeItem["kind"] = "create"): ChangeItem => ({
  id: title,
  kind,
  title,
  start: `2026-10-28T${s}:00+09:00`,
  end: `2026-10-28T${e}:00+09:00`,
});

describe("操作の記録（AI を介さない操作を AI に伝える）", () => {
  it("［元に戻す］の記録には、取り消した予定と「入れ直さない」が入る", () => {
    const note = undoNote([item("夕飯の準備", "17:30", "18:15")], tz);
    expect(isActivity(note)).toBe(true);
    expect(note).toContain("17:30-18:15 夕飯の準備（追加）");
    expect(note).toContain("入れ直さない");
    // 画面では AI 向けの注意書きを省く
    expect(noteText(note)).toBe("［元に戻す］で、次の変更を取り消しました：17:30-18:15 夕飯の準備（追加）。");
  });

  it("手動編集の記録", () => {
    const note = editNote([item("レポート：本文", "20:30", "21:30", "update")], 1, tz);
    expect(noteText(note)).toBe("結果カードで予定を手で編集し、次のように直しました：20:30-21:30 レポート：本文（変更）。1件を削除しました。");
  });

  it("履歴では、記録は「メモ」として出し、ユーザーの発言にはしない", async () => {
    const store = new MemoryStore();
    const user = crypto.randomUUID();
    await store.addMessages(user, [{ role: "user", content: "夕飯の準備を入れて" }, { role: "assistant", content: "入れました" }]);
    await store.addMessages(user, [{ role: "user", content: undoNote([item("夕飯の準備", "17:30", "18:15")], tz) }]);
    const { messages } = await store.listMessages(user, { limit: 30 });
    expect(toChatEntries(messages, new Map()).map((e) => e.role)).toEqual(["user", "assistant", "note"]);
    // AI に渡す直近の会話には、記録もそのまま入る
    expect((await store.recentMessages(user, 10)).at(-1)?.content).toContain("入れ直さない");
  });
});
