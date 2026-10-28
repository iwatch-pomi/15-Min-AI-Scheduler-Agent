# AIスケジュールアシスタント

（開発名：15-Min AI Scheduler）

開いた瞬間に**今日の15分グリッドのタイムライン**が見えて、下のチャット欄で AI 秘書に予定を頼めるアプリ（PWA）。
「14時から要件定義1時間、そのあと問い合わせ返信15分」と送ると、AI が Google カレンダーの空き時間に15分単位で組み込みます。
変更はすぐ反映され、トーストの［元に戻す］で取り消せます。

<img src="docs/screenshot.png" alt="ホーム・カレンダー・AI・設定の画面">

## できること（MVP）

- 下部タブで **ホーム／カレンダー／AI／マイページ** を切り替え（Minimal Organic デザイン：オフホワイト × チャコール × エメラルド）
- **ホーム**：日付と挨拶、AI アシスタント、週表示（タップ・スワイプで日を切り替え）、アイコン付きの予定カード（場所・長さ・進行中の残り時間）、予定から作る「AIのおすすめ」（タップで AI の入力欄に依頼文が入る）
- **カレンダー**：15分グリッドのタイムライン（日送り可。AI の予定は青、メインのカレンダーの予定はグレーで「※ 変更しない」）
- **AI**：チャットで依頼すると、変更した予定を結果カードで表示し［スケジュールを確認］［元に戻す］ができる
- **毎日のルーティン**：マイページで「名前・時刻・長さ・曜日」を登録すると、AI 専用カレンダーに繰り返しの予定として入る。AI は頼まれたときだけ、その日の分を動かす・スキップする（「15分延長」などでまとめてずれることはない）。変更・削除は今日以降に反映し、過去の分は残す
- **チャット履歴**：AI との会話は保存され、再読み込みしても結果カードごと見返せる（30件ずつ、さかのぼって読める）。マイページから削除できる
- チャット / 音声入力で予定を追加・移動・削除。大きいタスクは AI が15〜60分のアクションに分解
- ワンタップの「15分延長」「今のをスキップ」「割り込み30分」→ 後続の AI ブロックを自動で後ろ倒し
- 1回のチャットで行った変更をまとめて **Undo**
- AI の予定は Google カレンダーの**専用カレンダー「AIスケジューラー」**に入る（自動で作成・色分け）。メインのカレンダーは読むだけの権限で、変更しない
- 1ユーザー1日あたりの AI の予算（実際の費用で計算。公開時のコスト対策）

## 構成

```
[ ブラウザ / PWA ] ── Next.js (App Router, Vercel)
                         ├─ Auth.js (Google OAuth, scope: calendar.events)
                         ├─ /api/chat ── Claude API (tool use) ──► Google Calendar API
                         ├─ /api/events, /api/status, /api/undo
                         └─ Supabase（ユーザー・暗号化したリフレッシュトークン・操作ログ・チャット履歴・利用回数）
```

| パス | 役割 |
|---|---|
| `app/page.tsx` | ログイン画面 / メイン画面 |
| `components/` | `Scheduler`（状態とタブ）、`HomeView`・`CalendarView`・`ChatView`・`SettingsView`（各タブ）、`TabBar`、`ResultCard`、`icons` |
| `app/api/chat` | メッセージ → AI エージェント → 返答と Undo 用 `opId` |
| `app/api/events` | `GET ?date=YYYY-MM-DD&tz=…` その日の予定 |
| `app/api/status` | `GET` 今のブロックと残り時間・次の予定（ウィジェット・ショートカット用） |
| `app/api/undo` | `POST { opId }` そのチャットの変更をまとめて取り消す |
| `lib/agent.ts` | Claude とのツール呼び出しループ、システムプロンプト |
| `lib/tools.ts` | AI が使うツール：`get_schedule` / `create_blocks` / `update_block` / `delete_block` / `shift_following` |
| `lib/calendar/` | カレンダーの読み書き（`google.ts` 本番、`memory.ts` デモ・テスト） |
| `lib/ops.ts` | 変更の記録と Undo |
| `lib/store/` | 操作ログ・履歴・利用回数の保存（Supabase / メモリ） |
| `supabase/schema.sql` | DB スキーマ |

AI ブロックは、アプリが自動で作る専用カレンダー（id は `users.ai_calendar_id`）に入れて見分けています。メインのカレンダーは `calendar.events.readonly` で読むだけです。

## まずデモで動かす（Google / Supabase 不要）

```bash
npm install
echo "DEMO_MODE=1" > .env.local
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local   # チャットを試すなら
npm run dev   # → http://localhost:3000
```

デモモードではログインなしで、予定はサーバーのメモリに保存されます（再起動で消えます）。

## 本番セットアップ

### 1. Google Cloud（ログインとカレンダー）

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「API とサービス」→「ライブラリ」で **Google Calendar API** を有効化
3. 「OAuth 同意画面」
   - ユーザーの種類：**外部**、公開ステータス：**テスト**
   - スコープ（データアクセス）に次の2つを追加
     - `.../auth/calendar.events.readonly`（メインのカレンダーを読む）
     - `.../auth/calendar.app.created`（AI 専用カレンダーを作って書き込む）
   - **テストユーザー**に自分（と試してもらう人）の Google アカウントを追加（最大100人）
4. 「認証情報」→「OAuth クライアント ID」→ 種類：**ウェブアプリケーション**
   - 承認済みのリダイレクト URI：
     - `http://localhost:3000/api/auth/callback/google`
     - `https://<本番ドメイン>/api/auth/callback/google`
   - クライアント ID / シークレットを `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` に

### 2. Supabase（データ保存）

1. [Supabase](https://supabase.com/) で New project
2. SQL Editor で `supabase/schema.sql` を実行（何度実行しても大丈夫。アップデートで列が増えたときも、もう一度実行すればよい）
3. Project Settings → API の **Project URL** と **service_role** キーを `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` に（service_role はサーバーの環境変数だけに置く）

### 3. 環境変数

`.env.example` を `.env.local` にコピーして埋めます。

```bash
npx auth secret             # AUTH_SECRET を生成
openssl rand -base64 32     # TOKEN_ENC_KEY を生成
```

### 4. Vercel にデプロイ

1. Vercel でこのリポジトリをインポート（フレームワークは Next.js が自動で選ばれる）
2. Environment Variables に `.env.local` と同じ値を登録（`DEMO_MODE` は入れない）
3. デプロイ後、本番 URL のリダイレクト URI を GCP に追加
4. スマホで開いて「ホーム画面に追加」するとアプリのように使えます

`https://<本番ドメイン>/api/health` を開き、`"ready": true`（すべての項目が `ok`）になっていれば準備完了です。`ng` の項目は、その環境変数が未設定か、`supabase_schema` なら `schema.sql` が未実行か Supabase の URL・キーが違います。

## 開発

```bash
npm run dev         # 開発サーバー
npm test            # ユニットテスト（時刻計算・空き枠・ツール・Undo・エージェントのループ）
npm run lint
npm run typecheck
npm run build
```

## 一般公開に向けて

- `calendar.events` は Google の**センシティブスコープ**です。テストユーザー以外に公開するには、OAuth 同意画面の**アプリ審査**（プライバシーポリシー、利用規約、デモ動画など）が必要です。
- AI の費用は、1人1日の**予算（`DAILY_AI_BUDGET_USD`、既定 $0.50）**で抑えています。依頼ごとに Claude が返すトークン数から実際の費用を計算して足し、予算を使い切るとその日は AI を呼びません（画面には「残り◯％」と表示）。料金表は `lib/pricing.ts`。エラーになった依頼も、AI を呼んだ分は数えます。［元に戻す］と手動編集は AI を使わないので減りません。
- リフレッシュトークンは `TOKEN_ENC_KEY` で AES-256-GCM 暗号化して保存しています。キーを変えると全員再ログインが必要です。

## ロードマップ

1. ~~MVP：タイムライン + チャットで追加・移動・削除・後ろ倒し + Undo~~
2. ブロック終了時の Web Push 通知、「延長／完了／スキップ」の通知アクション、週ビュー
3. iOS ショートカット・LINE Bot からの入力（`/api/status` + API トークン）、タスクの持ち越し
4. 公開準備：OAuth 審査、LP、課金
