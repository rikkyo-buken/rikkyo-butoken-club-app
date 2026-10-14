-- =============================================================
-- 舞研アプリ：段階2（財務・大会・備品）のための変更
--   * 5年生以上は4年生として扱う
--   * 振込先などのサークル設定
--   * 大会のエントリー費は「カップル1組あたりの金額」を手入力し、2人で半分ずつ負担
--   * 大会の確定と同時に請求を作る
--   * 学年ごとの金額を指定して請求を一括作成する
--   * 貸出の記録（返却日の自動入力）
-- =============================================================

-- ---------- 学年：5年生以上は4年生 ----------
create or replace function public.grade_of(p_join_year int)
returns int language sql stable as $$
  select least(public.current_fiscal_year() - p_join_year + 1, 4)
$$;

-- ---------- サークル設定（1行だけ） ----------
create table public.club_settings (
  id         int primary key default 1 check (id = 1),
  bank_info  text,          -- 振込先。お金の画面に表示する
  updated_at timestamptz not null default now()
);
insert into public.club_settings (id) values (1);
create trigger club_settings_touch before update on public.club_settings
  for each row execute function public.touch_updated_at();

alter table public.club_settings enable row level security;
revoke all on public.club_settings from anon;
create policy club_settings_select on public.club_settings for select to authenticated
  using (public.is_active_member());
create policy club_settings_update on public.club_settings for update to authenticated
  using (public.has_role('treasurer')) with check (public.has_role('treasurer'));

-- ---------- 大会：カップル1組あたりの金額 ----------
alter table public.competitions rename column fee_per_dance to entry_fee;
comment on column public.competitions.entry_fee is 'カップル1組あたりのエントリー費（初期値）。確定時に組ごとに変更できる';
alter table public.entries add column fee int check (fee >= 0);
comment on column public.entries.fee is 'この組のエントリー費。空なら大会の entry_fee を使う';

-- 部員は自分の組の金額を変えられない
create or replace function public.guard_entries()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_comp public.competitions;
begin
  if public.has_role('captain', 'vice_captain') then
    return coalesce(new, old);
  end if;

  select * into v_comp from public.competitions
   where id = coalesce(new.competition_id, old.competition_id);
  if v_comp.status <> 'recruiting' or v_comp.request_deadline < now() then
    raise exception '希望の締切を過ぎています';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' and new.competition_id <> old.competition_id then
    raise exception '大会は変更できません';
  end if;
  if new.status <> 'requested' then
    raise exception '確定は主将・副将だけができます';
  end if;
  if (tg_op = 'INSERT' and (cardinality(new.confirmed_dances) > 0 or new.fee is not null))
     or (tg_op = 'UPDATE' and (new.confirmed_dances <> old.confirmed_dances or new.fee is distinct from old.fee)) then
    raise exception '確定は主将・副将だけができます';
  end if;
  if exists (
       select 1 from unnest(new.requested_dances) d
       where d not in (select dance from public.competition_dances where competition_id = new.competition_id)) then
    raise exception 'この大会で実施しない種目が含まれています';
  end if;
  return new;
end $$;

-- 大会を確定して、エントリー費の請求を作る（主将・副将）
-- 確定済みの組だけが対象。金額は2人で半分ずつ、端数はリーダーが負担
create or replace function public.confirm_competition(p_competition_id uuid, p_due_date date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_comp public.competitions;
  v_bill uuid;
  e record;
  v_fee int;
begin
  if not public.has_role('captain', 'vice_captain') then
    raise exception '大会の確定は主将・副将だけができます';
  end if;

  select * into v_comp from public.competitions where id = p_competition_id for update;
  if not found then
    raise exception '大会が見つかりません';
  end if;
  if v_comp.status <> 'recruiting' then
    raise exception 'この大会はすでに確定しています';
  end if;

  insert into public.bills (kind, title, due_date, competition_id, created_by, note)
  values ('competition', v_comp.name || ' エントリー費', p_due_date, v_comp.id, public.current_member_id(),
          'カップルのエントリー費を2人で半分ずつ負担')
  returning id into v_bill;

  for e in select * from public.entries where competition_id = v_comp.id and status = 'confirmed' loop
    v_fee := coalesce(e.fee, v_comp.entry_fee);
    if v_fee > 0 then
      insert into public.bill_items (bill_id, member_id, amount)
      values (v_bill, e.leader_id, ceil(v_fee / 2.0)::int)
      on conflict (bill_id, member_id) do update set amount = public.bill_items.amount + excluded.amount;
      insert into public.bill_items (bill_id, member_id, amount)
      values (v_bill, e.partner_id, floor(v_fee / 2.0)::int)
      on conflict (bill_id, member_id) do update set amount = public.bill_items.amount + excluded.amount;
    end if;
  end loop;

  -- 確定されなかった希望は「見送り」にする
  update public.entries set status = 'withdrawn'
   where competition_id = v_comp.id and status = 'requested';
  update public.competitions set status = 'confirmed' where id = v_comp.id;

  return v_bill;
end $$;

-- ---------- 学年ごとの金額で請求を作る（財務） ----------
-- p_amounts の例：{"1": 3000, "2": 5000, "3": 5000, "4": 5000}
-- 指定した学年の在籍部員全員に、その学年の金額で請求を作る
create or replace function public.create_bill(
  p_kind     public.bill_kind,
  p_title    text,
  p_due_date date,
  p_note     text,
  p_amounts  jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_bill   uuid;
  v_grades int[];
begin
  if not public.has_role('treasurer') then
    raise exception '請求の作成は財務だけができます';
  end if;
  select array_agg(k::int order by k::int) into v_grades from jsonb_object_keys(p_amounts) k;
  if v_grades is null then
    raise exception '金額を1つ以上入力してください';
  end if;

  insert into public.bills (kind, title, due_date, note, target_grades, created_by)
  values (p_kind, p_title, p_due_date, nullif(btrim(p_note), ''), v_grades, public.current_member_id())
  returning id into v_bill;

  insert into public.bill_items (bill_id, member_id, amount)
  select v_bill, m.id, (p_amounts ->> public.grade_of(m.join_year)::text)::int
  from public.members m
  where m.status = 'active'
    and p_amounts ? public.grade_of(m.join_year)::text
    and (p_amounts ->> public.grade_of(m.join_year)::text)::int > 0;

  return v_bill;
end $$;

-- ---------- 貸出：返却・貸出の日付を自動で入れる ----------
create or replace function public.before_loan_update()
returns trigger language plpgsql as $$
begin
  if new.status = 'lent' and old.status <> 'lent' then
    new.lent_on := coalesce(new.lent_on, current_date);
  end if;
  if new.status = 'returned' and old.status <> 'returned' then
    new.returned_on := coalesce(new.returned_on, current_date);
  end if;
  return new;
end $$;
create trigger loans_before_update before update on public.loans
  for each row execute function public.before_loan_update();
