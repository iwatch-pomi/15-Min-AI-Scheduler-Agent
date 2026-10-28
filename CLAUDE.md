# 開発のルール（AIスケジュールアシスタント）

## Claude の AI を使ったら、必ず使用量を消費する
- Claude API を呼ぶのは `lib/claude.ts` の `createMessage(meter, …)` だけ。ほかのファイルから `@anthropic-ai/sdk` を直接呼ばない（型だけの import は可）
- Claude を使う処理を呼ぶ API ルートは、必ず `lib/budget.ts` の `withAiBudget` で包む。予算の確認（使い切っていたら AI を呼ばない）と、費用の記録（失敗した場合も呼んだ分は数える）をそこで行う
- AI を使わない操作（［元に戻す］、手動編集、ルーティンの登録など）は使用量を消費しない
- `tests/claude-gateway.test.ts` がこのルールを確認している

## 料金
- 1日の上限は回数ではなく費用（`DAILY_AI_BUDGET_USD`、既定 $0.50）。料金表は `lib/pricing.ts`

## セキュリティ
- API は `app/api/` の下に置く（`proxy.ts` が書き込みの送り元を確認する）。データは必ず `getUserContext()` の userId で絞る
- 外部のスクリプト・画像などを使うときは `proxy.ts` の Content-Security-Policy に足す

## そのほか
- 画面の文言は日本語。コードのコメントも日本語で書く
- `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` を通してからコミットする
