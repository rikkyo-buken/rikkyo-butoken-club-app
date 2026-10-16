-- =============================================================
-- 舞研アプリ：通知
--   * notifications：部員ごとの「お知らせ（ベル）」。スマホへのプッシュ通知もここから送る
--   * 出来事が起きたら自動で通知を作る（請求・支払い報告・承認・ペアのエントリー・
--     予定の変更や中止・お知らせ・借用・大会の募集）
--   * daily_reminders()：毎朝9時に、締切や返却期限が近いものを通知する
-- =============================================================

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  title       text not null,
  body        text,
  url         text,                 -- タップしたときに開く画面（例：/money）
  dedupe_key  text unique,          -- 同じ通知を二重に作らないための印
  read_at     timestamptz,
  pushed_at   timestamptz,          -- スマホに送った日時
  created_at  timestamptz not null default now()
);
create index notifications_member_idx on public.notifications (member_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
create policy notifications_select on public.notifications for select to authenticated
  using (member_id = public.current_member_id());
create policy notifications_update on public.notifications for update to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
create policy notifications_delete on public.notifications for delete to authenticated
  using (member_id = public.current_member_id());

-- ---------- 通知を作る道具 ----------
create or replace function public.notify(p_member uuid, p_title text, p_body text, p_url text, p_key text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (member_id, title, body, url, dedupe_key)
  select p_member, p_title, p_body, p_url, p_key
  where exists (select 1 from public.members where id = p_member and status = 'active')
  on conflict (dedupe_key) do nothing
$$;

-- 指定の役職を持つ在籍部員（管理者を含む）全員に
create or replace function public.notify_roles(p_roles public.club_role[], p_title text, p_body text, p_url text, p_key text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (member_id, title, body, url, dedupe_key)
  select distinct m.id, p_title, p_body, p_url, case when p_key is null then null else p_key || ':' || m.id end
  from public.members m join public.member_roles r on r.member_id = m.id
  where m.status = 'active' and (r.role = 'admin' or r.role = any (p_roles))
  on conflict (dedupe_key) do nothing
$$;

-- 対象学年の在籍部員全員に（空なら全員）
create or replace function public.notify_grades(p_grades int[], p_title text, p_body text, p_url text, p_key text default null, p_except uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (member_id, title, body, url, dedupe_key)
  select m.id, p_title, p_body, p_url, case when p_key is null then null else p_key || ':' || m.id end
  from public.members m
  where m.status = 'active'
    and (p_grades is null or cardinality(p_grades) = 0 or public.grade_of(m.join_year) = any (p_grades))
    and m.id is distinct from p_except
  on conflict (dedupe_key) do nothing
$$;

create or replace function public.jst_date(t timestamptz)
returns text language sql immutable as $$
  select to_char(t at time zone 'Asia/Tokyo', 'FMMM/FMDD HH24:MI')
$$;

-- ---------- 出来事ごとの通知 ----------

-- 請求が届いた（本人へ）
create or replace function public.on_bill_item_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_bill public.bills;
begin
  select * into v_bill from public.bills where id = new.bill_id;
  if v_bill.closed_at is null then
    perform public.notify(new.member_id, '請求が届きました',
      v_bill.title || '：' || to_char(new.amount, 'FM999,999,999') || '円'
        || coalesce('（締切 ' || to_char(v_bill.due_date, 'FMMM/FMDD') || '）', ''),
      '/money', 'bill_item:' || new.id);
  end if;
  return new;
end $$;
create trigger bill_items_notify after insert on public.bill_items
  for each row execute function public.on_bill_item_insert();

-- 支払いの報告が届いた（財務へ）／承認・差し戻し（本人へ）
create or replace function public.on_payment_report_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_item public.bill_items;
  v_title text;
  v_name text;
begin
  select * into v_item from public.bill_items where id = new.bill_item_id;
  select title into v_title from public.bills where id = v_item.bill_id;
  if tg_op = 'INSERT' then
    select nickname into v_name from public.members where id = v_item.member_id;
    perform public.notify_roles(array['treasurer']::public.club_role[], '支払いの報告が届きました',
      v_name || 'さん：' || v_title || '（' || to_char(v_item.amount, 'FM999,999,999') || '円）', '/money', 'report:' || new.id);
  elsif new.result is distinct from old.result and new.result = 'approved' then
    perform public.notify(v_item.member_id, '入金を確認しました', v_title, '/money', 'report_ok:' || new.id);
  elsif new.result is distinct from old.result and new.result = 'rejected' then
    perform public.notify(v_item.member_id, '支払い報告が差し戻されました',
      v_title || '：' || coalesce(new.rejected_reason, ''), '/money', 'report_ng:' || new.id);
  end if;
  return new;
end $$;
create trigger payment_reports_notify after insert or update on public.payment_reports
  for each row execute function public.on_payment_report_change();

-- ペアの相手が自分の分もエントリーした（自動で入った側へ）
create or replace function public.on_entry_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_comp text;
  v_name text;
begin
  if new.partner_id is not null and new.member_id is distinct from public.current_member_id() then
    select name into v_comp from public.competitions where id = new.competition_id;
    select nickname into v_name from public.members where id = new.partner_id;
    perform public.notify(new.member_id, 'ペアでエントリーされました',
      v_name || 'さんが「' || v_comp || '」にエントリーしました', '/contest', 'entry:' || new.id);
  end if;
  return new;
end $$;
create trigger entries_notify after insert on public.entries
  for each row execute function public.on_entry_insert();

-- これからの予定が変更・中止された（対象学年へ。操作した本人は除く）
create or replace function public.on_event_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.starts_at > now() then
      perform public.notify_grades(old.target_grades, '予定が中止されました',
        public.jst_date(old.starts_at) || ' ' || old.title, '/schedule', null, public.current_member_id());
    end if;
    return old;
  end if;
  if new.starts_at > now() and (
       new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    or new.location is distinct from old.location or new.title is distinct from old.title) then
    perform public.notify_grades(new.target_grades, '予定が変更されました',
      public.jst_date(new.starts_at) || ' ' || new.title || coalesce('・' || new.location, ''), '/schedule', null, public.current_member_id());
  end if;
  return new;
end $$;
create trigger events_notify after update or delete on public.events
  for each row execute function public.on_event_change();

-- お知らせが投稿された（対象学年へ）
create or replace function public.on_announcement_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_grades(new.target_grades, 'お知らせ', left(new.body, 80), '/', 'announcement:' || new.id, new.author_id);
  return new;
end $$;
create trigger announcements_notify after insert on public.announcements
  for each row execute function public.on_announcement_insert();

-- 大会のエントリー募集が始まった（対象学年へ）
create or replace function public.on_competition_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_grades(new.target_grades, 'エントリー募集：' || new.name,
    '締切 ' || public.jst_date(new.request_deadline), '/contest', 'competition:' || new.id);
  return new;
end $$;
create trigger competitions_notify after insert on public.competitions
  for each row execute function public.on_competition_insert();

-- 借用の申請（備品管理へ）／承認・お断り（本人へ）
create or replace function public.on_loan_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_item text;
begin
  select name into v_item from public.equipment where id = new.equipment_id;
  if tg_op = 'INSERT' and new.status = 'requested' then
    select nickname into v_name from public.members where id = new.borrower_id;
    perform public.notify_roles(array['equipment']::public.club_role[], '借用の申請が届きました',
      v_name || 'さん：' || v_item, '/equipment', 'loan_req:' || new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'lent' then
      perform public.notify(new.borrower_id, '貸出が承認されました',
        v_item || coalesce('（返却期限 ' || to_char(new.due_on, 'FMMM/FMDD') || '）', ''), '/equipment', 'loan_ok:' || new.id);
    elsif new.status = 'rejected' then
      perform public.notify(new.borrower_id, '借用の申請が通りませんでした', v_item, '/equipment', 'loan_ng:' || new.id);
    end if;
  end if;
  return new;
end $$;
create trigger loans_notify after insert or update on public.loans
  for each row execute function public.on_loan_change();

-- ---------- 毎朝の自動チェック ----------
-- 何度実行しても、同じ日の同じ通知は1回だけ（dedupe_key に日付を入れている）
create or replace function public.daily_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_before int;
  v_after int;
  r record;
begin
  select count(*) into v_before from public.notifications;

  -- 支払い締切の3日前と当日（回収中の請求の未納のみ）
  for r in
    select i.id, i.member_id, i.amount, b.title, b.due_date
    from public.bill_items i join public.bills b on b.id = i.bill_id
    where i.status = 'unpaid' and b.closed_at is null and b.due_date in (v_today, v_today + 3)
  loop
    perform public.notify(r.member_id,
      case when r.due_date = v_today then '今日が支払い締切です' else '支払い締切まであと3日です' end,
      r.title || '：' || to_char(r.amount, 'FM999,999,999') || '円', '/money', 'due:' || r.id || ':' || v_today);
  end loop;

  -- 大会のエントリー締切の3日前と当日（対象学年でまだエントリーしていない人）
  for r in
    select c.id, c.name, c.request_deadline, m.id as member_id
    from public.competitions c
    join public.members m on m.status = 'active'
      and (c.target_grades is null or cardinality(c.target_grades) = 0 or public.grade_of(m.join_year) = any (c.target_grades))
    where c.status = 'recruiting'
      and (c.request_deadline at time zone 'Asia/Tokyo')::date in (v_today, v_today + 3)
      and not exists (select 1 from public.entries e where e.competition_id = c.id and e.member_id = m.id)
  loop
    perform public.notify(r.member_id, 'エントリー締切が近づいています',
      r.name || '（締切 ' || public.jst_date(r.request_deadline) || '）', '/contest', 'comp_due:' || r.id || ':' || r.member_id || ':' || v_today);
  end loop;

  -- 返却期限の前日（本人）と、期限を1日過ぎたとき（本人と備品管理）
  for r in
    select l.id, l.borrower_id, l.due_on, e.name, m.nickname
    from public.loans l join public.equipment e on e.id = l.equipment_id join public.members m on m.id = l.borrower_id
    where l.status = 'lent' and l.due_on in (v_today + 1, v_today - 1)
  loop
    if r.due_on = v_today + 1 then
      perform public.notify(r.borrower_id, '明日が返却期限です', r.name, '/equipment', 'loan_due:' || r.id);
    else
      perform public.notify(r.borrower_id, '返却期限を過ぎています', r.name || '（期限 ' || to_char(r.due_on, 'FMMM/FMDD') || '）', '/equipment', 'loan_over:' || r.id);
      perform public.notify_roles(array['equipment']::public.club_role[], '返却されていない備品があります',
        r.nickname || 'さん：' || r.name, '/equipment', 'loan_over_mgr:' || r.id);
    end if;
  end loop;

  select count(*) into v_after from public.notifications;
  return v_after - v_before;
end $$;
revoke execute on function public.daily_reminders() from public, anon, authenticated;
