import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext } from "@/lib/context";
import { errorResponse } from "@/lib/http";
import { DEFAULT_QUICK_ACTIONS, MAX_QUICK_ACTIONS, MAX_QUICK_ACTION_LENGTH, normalizeQuickActions } from "@/lib/quick-actions";

// クイックボタン（AI 画面のワンタップのボタン）。端末間で共有する。AI は使わない

// GET /api/quick-actions → { actions }（まだ決めていなければ初期値）
export async function GET() {
  try {
    const { userId, store } = await getUserContext();
    const saved = await store.getQuickActions(userId).catch((err) => {
      // schema.sql が古い（user_settings がない）ときも、初期値で画面は動くようにする
      console.error("クイックボタンを読めませんでした", err);
      return null;
    });
    return NextResponse.json({ actions: saved ?? DEFAULT_QUICK_ACTIONS, saved: saved !== null });
  } catch (err) {
    return errorResponse(err);
  }
}

const body = z.object({
  actions: z.array(z.string().max(MAX_QUICK_ACTION_LENGTH * 2)).max(MAX_QUICK_ACTIONS * 2),
});

// PUT /api/quick-actions { actions } → 保存した一覧（空・重複・長すぎるものを除き、8個まで）
export async function PUT(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "ボタンの内容が不正です" }, { status: 400 });
    const actions = normalizeQuickActions(parsed.data.actions);
    const { userId, store } = await getUserContext();
    await store.saveQuickActions(userId, actions);
    return NextResponse.json({ actions, saved: true });
  } catch (err) {
    return errorResponse(err);
  }
}
