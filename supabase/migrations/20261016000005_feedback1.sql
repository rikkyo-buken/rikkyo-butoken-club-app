-- =============================================================
-- 舞研アプリ：フィードバック反映（2026/10/16）
--   * ペア（カップル相手）をプロフィールに持たせる。設定すると相手側にも自動で反映
--   * 大会：エントリー費を大会から外す（請求は財務が作る）。種目は任意
--   * 大会：エントリーは1人1行。どちらかがエントリーすると、ペアの相手も自動でエントリー
--   * 請求：財務が「回収を締める」ことができる。個別に選んだ部員へ請求を作れる
--   * 備品：状態に「ドレスレンタル中」を追加
-- =============================================================

-- ---------- ペア ----------
alter table public.members add column partner_id uuid references public.members(id) on delete set null;
comment on column public.members.partner_id is 'ペア（カップル）の相手。set_partner() でだけ変更する';

-- 部員が直接書き換えられない項目に partner_id を加える（set_partner() 経由なら通す）
create or replace function public.guard_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.partner_change', true) = 'on' then
    return new;
  end if;
  if not public.has_role('admin') and (
       new.status       is distinct from old.status
    or new.join_year    is distinct from old.join_year
    or new.auth_user_id is distinct from old.auth_user_id
    or new.partner_id   is distinct from old.partner_id) then
    raise exception '状態・入部年度・ペアはこの方法では変更できません';
  end if;
  return new;
end $$;

-- 自分のペアを設定する（null で解除）。相手側も自動で自分をペアにし、
-- それまでのペア関係は両方とも解除する
create or replace function public.set_partner(p_partner uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := public.current_member_id();
  v_old uuid;
begin
  if v_me is null then
    raise exception 'ログインしていません';
  end if;
  if p_partner = v_me then
    raise exception '自分自身はペアにできません';
  end if;
  if p_partner is not null and not exists (select 1 from public.members where id = p_partner and status = 'active') then
    raise exception 'その部員は選べません';
  end if;

  perform set_config('app.partner_change', 'on', true);

  -- 自分の今のペア、相手の今のペアとの関係を解除
  select partner_id into v_old from public.members where id = v_me;
  update public.members set partner_id = null
   where id in (v_old, v_me)
      or (p_partner is not null and (id = p_partner or partner_id = p_partner));

  if p_partner is not null then
    update public.members set partner_id = p_partner where id = v_me;
    update public.members set partner_id = v_me where id = p_partner;
  end if;

  perform set_config('app.partner_change', 'off', true);
end $$;

-- 管理者が部員を引退にしたら、ペアも解除する
create or replace function public.clear_partner_on_retire()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'retired' and old.status <> 'retired' then
    perform set_config('app.partner_change', 'on', true);
    update public.members set partner_id = null where partner_id = new.id;
    perform set_config('app.partner_change', 'off', true);
    new.partner_id := null;
  end if;
  return new;
end $$;
create trigger members_clear_partner before update on public.members
  for each row execute function public.clear_partner_on_retire();

-- ---------- 大会：エントリー費をなくし、エントリーを作り直す ----------
drop function if exists public.confirm_competition(uuid, date);
drop table public.entries cascade;            -- 旧形式（リーダー・パートナーで1行）
drop function if exists public.guard_entries();
alter table public.competitions drop column entry_fee;
comment on column public.competitions.status is 'recruiting=募集中 / confirmed=募集締切 / finished=終了';

create table public.entries (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  member_id      uuid not null references public.members(id) on delete cascade,
  partner_id     uuid references public.members(id) on delete set null,  -- 一緒に出るペア（いれば）
  dances         text[] not null default '{}',
  status         public.entry_status not null default 'requested',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (competition_id, member_id)
);
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

alter table public.entries enable row level security;
revoke all on public.entries from anon;
create policy entries_select on public.entries for select to authenticated
  using (public.is_active_member());
-- 部員は submit_entry / withdraw_entry を使う。直接の書き込みは主将・副将だけ
create policy entries_manage on public.entries for all to authenticated
  using (public.has_role('captain', 'vice_captain'))
  with check (public.has_role('captain', 'vice_captain'));

-- エントリーする（締切前）。ペアがいれば相手の分も同じ内容で作る
create or replace function public.submit_entry(p_competition_id uuid, p_dances text[] default '{}')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := public.current_member_id();
  v_partner uuid;
  v_comp    public.competitions;
  v_has_dances boolean;
begin
  if v_me is null then
    raise exception 'ログインしていません';
  end if;
  select * into v_comp from public.competitions where id = p_competition_id;
  if not found or v_comp.status <> 'recruiting' or v_comp.request_deadline < now() then
    raise exception 'この大会は募集を締め切っています';
  end if;
  if not public.is_target(v_comp.target_grades) then
    raise exception 'この大会の対象学年ではありません';
  end if;

  v_has_dances := exists (select 1 from public.competition_dances where competition_id = p_competition_id);
  p_dances := coalesce(p_dances, '{}');
  if v_has_dances and cardinality(p_dances) = 0 then
    raise exception '種目を1つ以上選んでください';
  end if;
  if exists (select 1 from unnest(p_dances) d
             where d not in (select dance from public.competition_dances where competition_id = p_competition_id)) then
    raise exception 'この大会で実施しない種目が含まれています';
  end if;

  select m.partner_id into v_partner
    from public.members m join public.members p on p.id = m.partner_id and p.status = 'active'
   where m.id = v_me;

  insert into public.entries (competition_id, member_id, partner_id, dances)
  values (p_competition_id, v_me, v_partner, p_dances)
  on conflict (competition_id, member_id)
  do update set partner_id = excluded.partner_id, dances = excluded.dances, status = 'requested';

  if v_partner is not null then
    insert into public.entries (competition_id, member_id, partner_id, dances)
    values (p_competition_id, v_partner, v_me, p_dances)
    on conflict (competition_id, member_id)
    do update set partner_id = excluded.partner_id, dances = excluded.dances, status = 'requested';
  end if;
end $$;

-- エントリーを取り消す（締切前）。一緒に出るペアの分も取り消す
create or replace function public.withdraw_entry(p_competition_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := public.current_member_id();
  v_entry public.entries;
  v_comp  public.competitions;
begin
  select * into v_comp from public.competitions where id = p_competition_id;
  if not found or v_comp.status <> 'recruiting' or v_comp.request_deadline < now() then
    raise exception '締切後は取り消せません。主将・副将に連絡してください';
  end if;
  select * into v_entry from public.entries where competition_id = p_competition_id and member_id = v_me;
  if not found then
    return;
  end if;
  delete from public.entries
   where competition_id = p_competition_id
     and (member_id = v_me or (v_entry.partner_id is not null and member_id = v_entry.partner_id));
end $$;

-- ---------- 請求：回収の締め ----------
alter table public.bills add column closed_at timestamptz;
comment on column public.bills.closed_at is '財務が回収を締めた日時。締めた請求には支払い報告できない';

create or replace function public.before_payment_report_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_item public.bill_items;
  v_closed timestamptz;
begin
  select * into v_item from public.bill_items where id = new.bill_item_id;
  if v_item.member_id is distinct from public.current_member_id() then
    raise exception '自分の請求だけ報告できます';
  end if;
  select closed_at into v_closed from public.bills where id = v_item.bill_id;
  if v_closed is not null then
    raise exception 'この請求は回収を締め切っています';
  end if;
  if v_item.status <> 'unpaid' then
    raise exception 'この請求は報告済みか、支払い済みです';
  end if;
  new.result := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.rejected_reason := null;
  update public.bill_items set status = 'pending' where id = new.bill_item_id;
  return new;
end $$;

-- 集計に「締めたかどうか」を加える（戻り値が変わるので作り直す）
drop function if exists public.bill_summaries();
create function public.bill_summaries()
returns table (
  bill_id uuid, title text, due_date date,
  total_count int, paid_count int, pending_count int, unpaid_count int,
  total_amount int, paid_amount int, closed boolean
)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.due_date,
         count(i.*)::int,
         count(*) filter (where i.status = 'paid')::int,
         count(*) filter (where i.status = 'pending')::int,
         count(*) filter (where i.status = 'unpaid')::int,
         coalesce(sum(i.amount) filter (where i.status <> 'waived'), 0)::int,
         coalesce(sum(i.amount) filter (where i.status = 'paid'), 0)::int,
         b.closed_at is not null
  from public.bills b
  left join public.bill_items i on i.bill_id = b.id
  where public.has_role('captain', 'vice_captain', 'treasurer')
  group by b.id
  order by b.created_at desc
$$;

-- 個別に選んだ部員へ請求を作る（財務）
-- p_items の例：[{"member_id": "...", "amount": 2500}, ...]
create or replace function public.create_bill_for_members(
  p_kind           public.bill_kind,
  p_title          text,
  p_due_date       date,
  p_note           text,
  p_competition_id uuid,
  p_items          jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_bill uuid;
begin
  if not public.has_role('treasurer') then
    raise exception '請求の作成は財務だけができます';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception '請求する部員を1人以上選んでください';
  end if;

  insert into public.bills (kind, title, due_date, note, competition_id, created_by)
  values (p_kind, p_title, p_due_date, nullif(btrim(p_note), ''), p_competition_id, public.current_member_id())
  returning id into v_bill;

  insert into public.bill_items (bill_id, member_id, amount)
  select v_bill, (x ->> 'member_id')::uuid, (x ->> 'amount')::int
  from jsonb_array_elements(p_items) x
  where (x ->> 'amount')::int >= 0
  on conflict (bill_id, member_id) do update set amount = excluded.amount;

  return v_bill;
end $$;

-- ---------- 備品：ドレスレンタル中 ----------
alter type public.equipment_status add value if not exists 'dress_rental' before 'repair';
