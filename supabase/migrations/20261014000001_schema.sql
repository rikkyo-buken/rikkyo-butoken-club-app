-- =============================================================
-- 舞研アプリ：テーブル定義
-- 設計書「データ設計」の15テーブルに対応する。
-- 権限ルール（RLS）は 20261014000002_security.sql で設定する。
-- =============================================================

-- 招待トークンの乱数生成に使う（Supabaseでは extensions スキーマに入る）
create extension if not exists pgcrypto with schema extensions;

-- ---------- 型（選択肢） ----------
create type public.member_status   as enum ('active', 'retired');            -- 在籍 / 引退
create type public.dance_style     as enum ('latin', 'standard');           -- ラテン / スタンダード
create type public.dance_position  as enum ('leader', 'partner');           -- リーダー / パートナー
create type public.club_role       as enum ('admin', 'captain', 'vice_captain', 'treasurer', 'equipment');
create type public.event_kind      as enum ('practice', 'event');           -- 練習 / イベント
create type public.bill_kind       as enum ('dues', 'competition', 'camp_event'); -- 部費 / 大会 / 合宿・イベント
create type public.bill_item_status as enum ('unpaid', 'pending', 'paid', 'waived'); -- 未納 / 確認待ち / 支払い済み / 免除
create type public.payment_method  as enum ('transfer', 'cash');            -- 振込 / 現金
create type public.report_result   as enum ('pending', 'approved', 'rejected');
create type public.competition_status as enum ('recruiting', 'confirmed', 'finished'); -- 募集中 / 確定 / 終了
create type public.entry_status    as enum ('requested', 'confirmed', 'withdrawn');    -- 希望中 / 確定 / 見送り
create type public.equipment_status as enum ('available', 'repair', 'disposed');       -- 貸出可 / 修理中 / 廃棄
create type public.loan_status     as enum ('requested', 'lent', 'returned', 'rejected');

-- ---------- 共通：updated_at の自動更新 ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- 部員 ----------
create table public.members (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  full_name     text not null check (char_length(full_name) between 1 and 50),
  nickname      text not null check (char_length(nickname) between 1 and 30),
  join_year     int  not null check (join_year between 2000 and 2100), -- 入部年度。学年はここから計算する
  major         public.dance_style not null,
  position      public.dance_position not null,
  status        public.member_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.member_roles (
  member_id  uuid not null references public.members(id) on delete cascade,
  role       public.club_role not null,
  created_at timestamptz not null default now(),
  primary key (member_id, role)
);

-- 学年ごとの権限スイッチ。permission は 'schedule.edit' のような文字列
create table public.grade_permissions (
  grade      int  not null check (grade between 1 and 6),
  permission text not null,
  allowed    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (grade, permission)
);

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_by  uuid references public.members(id) on delete set null,
  expires_at  timestamptz not null default now() + interval '14 days',
  max_uses    int not null default 50 check (max_uses > 0),
  used_count  int not null default 0 check (used_count >= 0),
  created_at  timestamptz not null default now()
);

-- ---------- 予定・お知らせ ----------
-- target_grades が空（null または {}）なら全学年が対象
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  kind          public.event_kind not null default 'practice',
  title         text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  location      text,
  note          text,
  target_grades int[],
  created_by    uuid references public.members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index events_starts_at_idx on public.events (starts_at);

create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  body          text not null,
  target_grades int[],
  author_id     uuid references public.members(id) on delete set null,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- 大会 ----------
create table public.competitions (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  held_on          date not null,
  request_deadline timestamptz not null,
  fee_per_dance    int  not null default 0 check (fee_per_dance >= 0),
  target_grades    int[],
  status           public.competition_status not null default 'recruiting',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.competition_dances (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  dance          text not null,   -- 'サンバ', 'ワルツ' など
  primary key (competition_id, dance)
);

create table public.entries (
  id                uuid primary key default gen_random_uuid(),
  competition_id    uuid not null references public.competitions(id) on delete cascade,
  leader_id         uuid not null references public.members(id) on delete cascade,
  partner_id        uuid not null references public.members(id) on delete cascade,
  requested_dances  text[] not null default '{}',
  confirmed_dances  text[] not null default '{}',
  status            public.entry_status not null default 'requested',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (leader_id <> partner_id),
  unique (competition_id, leader_id),
  unique (competition_id, partner_id)
);

-- ---------- 財務 ----------
create table public.bills (
  id             uuid primary key default gen_random_uuid(),
  kind           public.bill_kind not null,
  title          text not null,
  due_date       date,
  target_grades  int[],
  competition_id uuid references public.competitions(id) on delete set null,
  note           text,
  created_by     uuid references public.members(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.bill_items (
  id         uuid primary key default gen_random_uuid(),
  bill_id    uuid not null references public.bills(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  amount     int  not null check (amount >= 0),
  status     public.bill_item_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bill_id, member_id)
);
create index bill_items_member_idx on public.bill_items (member_id);

create table public.payment_reports (
  id              uuid primary key default gen_random_uuid(),
  bill_item_id    uuid not null references public.bill_items(id) on delete cascade,
  paid_on         date not null default current_date,
  method          public.payment_method not null,
  memo            text,
  result          public.report_result not null default 'pending',
  reviewed_by     uuid references public.members(id) on delete set null,
  reviewed_at     timestamptz,
  rejected_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- 備品 ----------
create table public.equipment (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  location   text,
  status     public.equipment_status not null default 'available',
  photo_path text,   -- Storage の equipment-photos バケット内のパス
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loans (
  id           uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  borrower_id  uuid not null references public.members(id) on delete cascade,
  status       public.loan_status not null default 'requested',
  lent_on      date,
  due_on       date,
  returned_on  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- 同じ備品が同時に2人へ貸し出されないようにする
create unique index loans_one_active_per_equipment
  on public.loans (equipment_id) where status = 'lent';

-- ---------- 通知 ----------
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ---------- updated_at トリガー ----------
do $$
declare t text;
begin
  foreach t in array array['members','grade_permissions','events','announcements','competitions',
                           'entries','bills','bill_items','payment_reports','equipment','loans']
  loop
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------- 初期データ：学年別権限（2年以上は予定を編集可） ----------
insert into public.grade_permissions (grade, permission, allowed) values
  (1, 'schedule.edit', false),
  (2, 'schedule.edit', true),
  (3, 'schedule.edit', true),
  (4, 'schedule.edit', true);
