import { describe, expect, it } from "vitest";
import { ACTIVITY_PREFIX } from "@/lib/activity";
import { SUMMARY_PREFIX, compactHistory } from "@/lib/context-window";
import type { ChatMessage } from "@/lib/types";

const u = (content: string): ChatMessage => ({ role: "user", content });
const a = (content: string): ChatMessage => ({ role: "assistant", content });

describe("AI に渡す履歴を短くする", () => {
  it("5件以下ならそのまま", () => {
    const list = [u("1"), a("2"), u("3")];
    expect(compactHistory(list)).toEqual(list);
  });

  it("直近5件はそのまま、それより前は要約1つにまとめる", () => {
    const list = [u("明日の午前に資料作成2時間"), a("09:00-11:00 資料作成 を入れました。\n空きはあと30分です。"), u("a"), a("b"), u("c"), a("d"), u("e")];
    const out = compactHistory(list);
    expect(out).toHaveLength(6);
    expect(out.slice(1)).toEqual(list.slice(2));
    expect(out[0]).toEqual({
      role: "user",
      content: `${SUMMARY_PREFIX}\n- ユーザー：明日の午前に資料作成2時間\n- AI：09:00-11:00 資料作成 を入れました。 / 空きはあと30分です。`,
    });
  });

  it("長い発言は切る。［元に戻す］などの操作の記録は印を残して長めに残す", () => {
    const note = `${ACTIVITY_PREFIX}ユーザーが画面の［元に戻す］で、次の変更を取り消しました：13:00-14:00 会議（追加）。取り消した予定は入れ直さないこと。`;
    const out = compactHistory([u("あ".repeat(100)), a("い".repeat(100)), u(note), a("x"), u("x"), a("x"), u("x"), a("x")]);
    const lines = out[0].content.split("\n");
    expect(lines[1]).toBe(`- ユーザー：${"あ".repeat(40)}…`);
    expect(lines[2]).toBe(`- AI：${"い".repeat(60)}…`);
    expect(lines[3]).toBe(`- ${note}`);
  });

  it("古い5件は、要約で半分以下の長さになる", () => {
    const long = (i: number) => [u(`依頼${i} ${"詳しい説明".repeat(20)}`), a(`返事${i} ${"結果の説明".repeat(30)}`)];
    const list = [1, 2, 3, 4, 5].flatMap(long);
    const size = (m: ChatMessage[]) => m.reduce((n, x) => n + x.content.length, 0);
    const out = compactHistory(list);
    expect(out[0].content.length).toBeLessThan(size(list.slice(0, 5)) / 2);
    expect(size(out)).toBeLessThan(size(list));
  });
});
