import { describe, expect, it } from "vitest";
import { itemsFromOps, toChatEntries } from "@/lib/history";
import { MemoryStore } from "@/lib/store/memory";
import type { Block, Operation } from "@/lib/types";

const blk = (id: string, title: string, hhmm = "10:00"): Block => ({
  id,
  title,
  start: `2026-10-28T${hhmm}:00.000Z`,
  end: `2026-10-28T${hhmm.slice(0, 2)}:30:00.000Z`,
  ai: true,
});
const create = (b: Block): Operation => ({ kind: "create", blockId: b.id, before: null, after: b });
const update = (b: Block, after: Block): Operation => ({ kind: "update", blockId: b.id, before: b, after });
const remove = (b: Block): Operation => ({ kind: "delete", blockId: b.id, before: b, after: null });

describe("itemsFromOps（履歴の結果カード）", () => {
  it("AI が追加したものは手で直しても「追加」、手で消したら一覧から外す", () => {
    const a = blk("a", "確認");
    const b = blk("b", "作成", "11:00");
    const items = itemsFromOps([create(a), create(b), update(b, { ...b, title: "作成（前半）" }), remove(a)]);
    expect(items.map((i) => [i.id, i.kind, i.title])).toEqual([["b", "create", "作成（前半）"]]);
  });

  it("既存の AI の予定の変更・削除は「変更」「削除」", () => {
    const x = blk("x", "前からある予定");
    const y = blk("y", "消す予定");
    const items = itemsFromOps([update(x, { ...x, title: "後ろ倒し" }), remove(y)]);
    expect(items.map((i) => [i.id, i.kind, i.title])).toEqual([
      ["x", "update", "後ろ倒し"],
      ["y", "delete", "消す予定"],
    ]);
  });
});

describe("チャット履歴の保存と読み込み", () => {
  it("AI の変更と手動編集を同じグループに記録し、履歴に結果カード付きで出す", async () => {
    const store = new MemoryStore();
    const user = crypto.randomUUID();
    const group = crypto.randomUUID();
    const a = blk("a", "課題");
    await store.recordOps(user, group, [create(a)]);
    await store.addMessages(user, [{ role: "user", content: "課題を入れて" }, { role: "assistant", content: "入れました" }], group);
    await store.recordOps(user, group, [update(a, { ...a, title: "課題（直した）" })]); // 結果カードでの編集

    const { messages, hasMore } = await store.listMessages(user, { limit: 30 });
    const entries = toChatEntries(messages, await store.getOpGroups(user, [group]));
    expect(hasMore).toBe(false);
    expect(entries.map((e) => [e.role, e.text])).toEqual([
      ["user", "課題を入れて"],
      ["assistant", "入れました"],
    ]);
    const card = entries[1].role === "assistant" ? entries[1].result : undefined;
    expect(card).toMatchObject({ opIds: [group], undone: false });
    expect(card!.items.map((i) => [i.kind, i.title])).toEqual([["create", "課題（直した）"]]);

    // ［元に戻す］のあとは「取り消し済み」として出る
    expect(await store.getOps(user, group)).toHaveLength(2);
    await store.markUndone(user, group);
    const after = toChatEntries(messages, await store.getOpGroups(user, [group]));
    expect(after[1].role === "assistant" && after[1].result?.undone).toBe(true);
  });

  it("古いものはページに分けて読み、削除で全部消える。他の人の履歴は見えない", async () => {
    const store = new MemoryStore();
    const user = crypto.randomUUID();
    for (let i = 1; i <= 5; i++) await store.addMessages(user, [{ role: "user", content: `m${i}` }]);
    await store.addMessages(crypto.randomUUID(), [{ role: "user", content: "他の人" }]);

    const page1 = await store.listMessages(user, { limit: 3 });
    expect(page1.messages.map((m) => m.content)).toEqual(["m3", "m4", "m5"]);
    expect(page1.hasMore).toBe(true);
    const page2 = await store.listMessages(user, { before: page1.messages[0].id, limit: 3 });
    expect(page2.messages.map((m) => m.content)).toEqual(["m1", "m2"]);
    expect(page2.hasMore).toBe(false);

    await store.deleteMessages(user);
    expect((await store.listMessages(user, { limit: 3 })).messages).toEqual([]);
  });
});
