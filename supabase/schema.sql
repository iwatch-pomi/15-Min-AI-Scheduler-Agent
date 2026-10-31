-- 15-Min AI Scheduler: Supabase スキーマ
-- Supabase の SQL Editor に貼り付けて実行する。
-- サーバー（service_role）からのみアクセスする前提なので、RLS は有効にしてポリシーは作らない
-- （anon / authenticated キーからは一切読めない）。

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text,
  refresh_token_enc text,          -- AES-256-GCM で暗号化したリフレッシュトークン
  ai_calendar_id text,             -- AI 専用の Google カレンダー（アプリが自動で作る）
  timezone text not null default 'Asia/Tokyo',
  created_at timestamptz not null default now()
);

-- 既存のデータベース向け（2026-10 の更新で追加した列）
alter table users add column if not exists ai_calendar_id text;

-- プラン（free＝無料／plus＝ライト／standard＝スタンダード／pro＝プロ）と、Stripe の契約の状態。
-- プランは Stripe からの知らせ（webhook）でアプリが書き換える。手で変えるときは plan だけを書き換える
alter table users add column if not exists plan text not null default 'free';
alter table users add column if not exists stripe_customer_id text;
alter table users add column if not exists stripe_subscription_id text;
alter table users add column if not exists plan_status text;       -- active / trialing / past_due / canceling（期間の終わりに解約）
alter table users add column if not exists plan_renews_at timestamptz; -- 次の更新日（解約したときは、有料が終わる日）
-- プランを増やしたときも、作り直せば新しい名前を受け付ける
alter table users drop constraint if exists users_plan_check;
alter table users add constraint users_plan_check check (plan in ('free', 'plus', 'standard', 'pro'));
create unique index if not exists users_stripe_customer_idx on users (stripe_customer_id);

-- Undo 用の操作ログ。1回のチャットで行った変更は同じ op_group_id にまとまる
create table if not exists operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  op_group_id uuid not null,
  seq int not null,
  kind text not null check (kind in ('create', 'update', 'delete')),
  google_event_id text not null,
  before jsonb,
  after jsonb,
  undone boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists operations_group_idx on operations (user_id, op_group_id);

-- チャット履歴（直近の数件を AI の文脈として渡す）
create table if not exists messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  op_group_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists messages_user_idx on messages (user_id, id desc);

-- 1日あたりの AI 呼び出し回数（公開時のコスト上限用）
create table if not exists usage (
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  llm_calls int not null default 0,
  cost_microusd bigint not null default 0, -- AI の費用（100万分の1ドル単位）。1日の上限はこれで決める
  primary key (user_id, date)
);
alter table usage add column if not exists cost_microusd bigint not null default 0;
-- 「AIで更新」（AIブリーフ）を使った回数。無料プランは1日1回まで
alter table usage add column if not exists brief_calls int not null default 0;

create or replace function increment_usage(p_user_id uuid, p_date date)
returns int language sql as $$
  insert into usage (user_id, date, llm_calls) values (p_user_id, p_date, 1)
  on conflict (user_id, date) do update set llm_calls = usage.llm_calls + 1
  returning llm_calls;
$$;

create or replace function add_usage_cost(p_user_id uuid, p_date date, p_cost bigint)
returns bigint language sql as $$
  insert into usage (user_id, date, cost_microusd) values (p_user_id, p_date, p_cost)
  on conflict (user_id, date) do update set cost_microusd = usage.cost_microusd + excluded.cost_microusd
  returning cost_microusd;
$$;

create or replace function add_brief_calls(p_user_id uuid, p_date date, p_delta int)
returns int language sql as $$
  insert into usage (user_id, date, brief_calls) values (p_user_id, p_date, greatest(p_delta, 0))
  on conflict (user_id, date) do update set brief_calls = greatest(usage.brief_calls + p_delta, 0)
  returning brief_calls;
$$;

-- AI の依頼の鍵。1人が同時に送れる AI の依頼は1つまで（同時にたくさん送って、予算を超えて AI を呼ばれないように）。
-- locked_until を過ぎた鍵は、外し忘れとみなして取り直せる
create table if not exists ai_locks (
  user_id uuid primary key references users(id) on delete cascade,
  token text not null,
  locked_until timestamptz not null
);

create or replace function acquire_ai_lock(p_user_id uuid, p_token text, p_ttl_seconds int)
returns boolean language plpgsql as $$
declare
  n int;
begin
  insert into ai_locks (user_id, token, locked_until) values (p_user_id, p_token, now() + make_interval(secs => p_ttl_seconds))
  on conflict (user_id) do update set token = excluded.token, locked_until = excluded.locked_until
  where ai_locks.locked_until < now();
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- 短い時間にたくさん送られるのを止めるための回数（1人・種類ごとに、今の区切りの始まりと回数）
create table if not exists rate_limits (
  user_id uuid not null references users(id) on delete cascade,
  key text not null,
  window_start timestamptz not null,
  count int not null,
  primary key (user_id, key)
);

create or replace function hit_rate_limit(p_user_id uuid, p_key text, p_window_seconds int)
returns int language plpgsql as $$
declare
  n int;
begin
  insert into rate_limits (user_id, key, window_start, count) values (p_user_id, p_key, now(), 1)
  on conflict (user_id, key) do update set
    count = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.count + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning count into n;
  return n;
end;
$$;

-- その日の、全員の AI の費用の合計と、そのうち無料プランの人の分（異常な費用のときに AI を止めるため）
create index if not exists usage_date_idx on usage (date);
create or replace function total_usage_cost(p_date date)
returns table (all_microusd bigint, free_microusd bigint) language sql stable as $$
  select coalesce(sum(u.cost_microusd), 0)::bigint,
         coalesce(sum(u.cost_microusd) filter (where s.plan = 'free'), 0)::bigint
  from usage u join users s on s.id = u.user_id
  where u.date = p_date;
$$;

-- お問い合わせ（アプリ・紹介ページのフォームから。ログインしていなくても送れる）。
-- IP アドレスはそのまま残さず、ハッシュ（同じ送り元かどうかが分かるだけ）にする
create table if not exists contacts (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  name text,
  email text not null,
  category text not null check (category in ('usage', 'bug', 'billing', 'other')),
  message text not null,
  source text not null default 'app' check (source in ('app', 'lp', 'lp-arc')),
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists contacts_ip_idx on contacts (ip_hash, created_at desc);
create index if not exists contacts_created_idx on contacts (created_at desc);

-- AI で作った「AIのおすすめ／AIブリーフ」。日付とデザイン（口調）ごとに1つ。更新したら置き換える
create table if not exists briefs (
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  tone text not null default 'soft' check (tone in ('soft', 'stoic')),
  items jsonb not null,
  cost_percent real not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, date, tone)
);

-- 端末間で共有する設定（クイックボタンなど）。1ユーザー1行
create table if not exists user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  quick_actions jsonb,
  custom_instructions text,        -- AI へのカスタム指示（毎回 AI に渡す）
  updated_at timestamptz not null default now()
);
alter table user_settings add column if not exists custom_instructions text;

alter table users enable row level security;
alter table operations enable row level security;
alter table messages enable row level security;
alter table usage enable row level security;
alter table briefs enable row level security;
alter table user_settings enable row level security;
alter table ai_locks enable row level security;
alter table rate_limits enable row level security;
alter table contacts enable row level security;

-- 関数はサーバー（service_role）からだけ呼べるようにする。
-- anon / authenticated キーが漏れても、ほかの人の使用量を書き換えられないように
alter function increment_usage(uuid, date) set search_path = public;
alter function add_usage_cost(uuid, date, bigint) set search_path = public;
alter function add_brief_calls(uuid, date, int) set search_path = public;
alter function acquire_ai_lock(uuid, text, int) set search_path = public;
alter function hit_rate_limit(uuid, text, int) set search_path = public;
alter function total_usage_cost(date) set search_path = public;
revoke execute on function increment_usage(uuid, date) from public, anon, authenticated;
revoke execute on function add_usage_cost(uuid, date, bigint) from public, anon, authenticated;
revoke execute on function add_brief_calls(uuid, date, int) from public, anon, authenticated;
revoke execute on function acquire_ai_lock(uuid, text, int) from public, anon, authenticated;
revoke execute on function hit_rate_limit(uuid, text, int) from public, anon, authenticated;
revoke execute on function total_usage_cost(date) from public, anon, authenticated;
grant execute on function increment_usage(uuid, date) to service_role;
grant execute on function add_usage_cost(uuid, date, bigint) to service_role;
grant execute on function add_brief_calls(uuid, date, int) to service_role;
grant execute on function acquire_ai_lock(uuid, text, int) to service_role;
grant execute on function hit_rate_limit(uuid, text, int) to service_role;
grant execute on function total_usage_cost(date) to service_role;
