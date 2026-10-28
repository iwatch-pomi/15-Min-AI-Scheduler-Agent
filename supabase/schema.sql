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

alter table users enable row level security;
alter table operations enable row level security;
alter table messages enable row level security;
alter table usage enable row level security;

-- 関数はサーバー（service_role）からだけ呼べるようにする。
-- anon / authenticated キーが漏れても、ほかの人の使用量を書き換えられないように
alter function increment_usage(uuid, date) set search_path = public;
alter function add_usage_cost(uuid, date, bigint) set search_path = public;
revoke execute on function increment_usage(uuid, date) from public, anon, authenticated;
revoke execute on function add_usage_cost(uuid, date, bigint) from public, anon, authenticated;
grant execute on function increment_usage(uuid, date) to service_role;
grant execute on function add_usage_cost(uuid, date, bigint) to service_role;
