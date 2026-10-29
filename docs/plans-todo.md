# やることメモ：プラン（無料／ライト／スタンダード／プロ）

> 状態：**ほぼ済み**（2026-10-29）
> - 同日、有料プランを3つにし、スタンダードをおとりの値段にした
> - そのあと値上げした（スタンダード 1,780円・プロ 1,980円）。無料とライトの制限も強めた
> - 実装済み：プランの仕組み、月の上限、プランごとのモード、広告の枠、Stripe の支払い
> - 設定のしかたは [stripe-setup.md](stripe-setup.md)

## 済んだこと
- `users.plan`（`free` / `plus` / `standard` / `pro`）と Stripe の契約の状態（`supabase/schema.sql`）
- `lib/plans.ts`：プランごとの月の予算・1日の予算・使えるモード・広告の有無
- `lib/budget.ts`：1日と1か月の両方を確かめる。上限の理由（今日／今月）を分けて出す
- サーバーで、プランに無いモードを下げる（`/api/chat`）。マイページでは、使えないモードに鍵の印を付ける
- 広告：小さい広告（`components/AdSlot.tsx`）と全画面広告（`components/Interstitial.tsx`）。無料は両方、ライトはホームの小さい広告だけ。今は有料プランの案内
- Stripe：申し込み（Checkout）、管理（カスタマーポータル）、webhook でのプランの反映
- 規約などのページ（`/legal/…`、中身は `lib/legal.ts`）

## 残っていること
1. **広告の事業者を決めて入れる**（AdSense など）
   - `components/AdSlot.tsx`・`components/Interstitial.tsx` の中身を差し替える
   - 全画面広告は AdSense では入れられない（自作のオーバーレイは禁止）。Google Ad Manager の Web インタースティシャルなどを使う
   - `proxy.ts` の Content-Security-Policy に、その事業者のドメインを足す（script-src・img-src・frame-src・connect-src）
   - 広告の文字・リンクを、予定の情報（AI に渡す文脈）に混ぜない
2. **規約などのページの運営者の情報を埋める**（`lib/legal.ts` の `OPERATOR`）
3. 1回あたりの費用を下げる
   - `get_schedule` の返事から、要らない項目を削る（`lib/tools.ts` の `view`）
   - ~~「AIで更新」（AIブリーフ）の回数~~ → 済み：無料は使えない、ライトは1日1回（`PLANS` の `briefsPerDay`）

## 済み（以前）
- AI に渡す会話の履歴を減らした：直近5件はそのまま、その前の5件はアプリで要約（`lib/context-window.ts`）
- 節約は Haiku にし、難しい依頼だけ Sonnet に回す
