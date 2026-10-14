-- =============================================================
-- 舞研アプリ：共通関数と権限ルール（RLS）
-- 画面でボタンを隠すだけでなく、データベース自身がここで読み書きを判定する。
--
-- 基本方針
--   * 在籍中の部員（members.status = 'active'）でなければ何も読めない・書けない
--     → 引退した部員と、招待から登録していない人はアプリを使えない
--   * 管理者（admin）はすべての役職の権限を持つ
--   * 学年は入部年度から毎回計算する（4月1日に自動で繰り上がる）
-- =============================================================

-- ---------- 判定用の関数 ----------
-- security definer：members などを RLS を通さずに参照するため（再帰を防ぐ）

-- ログイン中の在籍部員のID（引退・未登録なら null）
create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members
  where auth_user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_member_id() is not null
$$;

-- 今の年度（4月始まり、日本時間）
create or replace function public.current_fiscal_year()
returns int language sql stable as $$
  select extract(year from (now() at time zone 'Asia/Tokyo') - interval '3 months')::int
$$;

create or replace function public.grade_of(p_join_year int)
returns int language sql stable as $$
  select public.current_fiscal_year() - p_join_year + 1
$$;

create or replace function public.my_grade()
returns int language sql stable security definer set search_path = public as $$
  select public.grade_of(join_year) from public.members where id = public.current_member_id()
$$;

-- 指定した役職のどれかを持つか（管理者は常に true）
create or replace function public.has_role(variadic p_roles public.club_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.member_roles
    where member_id = public.current_member_id()
      and (role = 'admin' or role = any (p_roles))
  )
$$;

-- 何かしらの役職を持つ幹部か
create or replace function public.is_officer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.member_roles where member_id = public.current_member_id())
$$;

-- 自分の学年にその権限が許可されているか
create or replace function public.grade_can(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select allowed from public.grade_permissions
    where grade = public.my_grade() and permission = p_permission
  ), false)
$$;

-- 対象学年に自分が入るか（空なら全員。幹部は管理のため常に見える）
create or replace function public.is_target(p_grades int[])
returns boolean language sql stable security definer set search_path = public as $$
  select p_grades is null
      or cardinality(p_grades) = 0
      or public.my_grade() = any (p_grades)
      or public.is_officer()
$$;

-- ---------- 招待リンクからの登録 ----------
-- メールのリンクでログインした直後、プロフィール入力画面からこれを呼ぶ
create or replace function public.register_member(
  p_token     text,
  p_full_name text,
  p_nickname  text,
  p_join_year int,
  p_major     public.dance_style,
  p_position  public.dance_position
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invites;
  v_id     uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインしていません';
  end if;
  if exists (select 1 from public.members where auth_user_id = auth.uid()) then
    raise exception 'このアカウントは登録済みです';
  end if;

  select * into v_invite from public.invites where token = p_token for update;
  if not found or v_invite.expires_at < now() or v_invite.used_count >= v_invite.max_uses then
    raise exception '招待リンクが無効か、期限が切れています';
  end if;

  update public.invites set used_count = used_count + 1 where id = v_invite.id;

  insert into public.members (auth_user_id, full_name, nickname, join_year, major, position)
  values (auth.uid(), p_full_name, p_nickname, p_join_year, p_major, p_position)
  returning id into v_id;

  return v_id;
end $$;

-- ---------- 書き込みの細かい制限（トリガー） ----------

-- 部員は自分のプロフィールを直せるが、状態・入部年度・ログイン紐づけは管理者だけが変えられる
-- （入部年度を変えると学年＝権限が変わるため）
create or replace function public.guard_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('admin') and (
       new.status       is distinct from old.status
    or new.join_year    is distinct from old.join_year
    or new.auth_user_id is distinct from old.auth_user_id) then
    raise exception '状態・入部年度は管理者だけが変更できます';
  end if;
  return new;
end $$;
create trigger members_guard before update on public.members
  for each row execute function public.guard_members();

-- 管理者を0人にしない
create or replace function public.guard_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and not exists (
       select 1 from public.member_roles r join public.members m on m.id = r.member_id
       where r.role = 'admin' and m.status = 'active' and r.member_id <> old.member_id) then
    raise exception '管理者が0人になるため外せません';
  end if;
  return old;
end $$;
create trigger member_roles_last_admin before delete on public.member_roles
  for each row execute function public.guard_last_admin();

-- 支払い報告：部員は自分の未納分だけ報告できる。報告すると「確認待ち」になる
create or replace function public.before_payment_report_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item public.bill_items;
begin
  select * into v_item from public.bill_items where id = new.bill_item_id;
  if v_item.member_id is distinct from public.current_member_id() then
    raise exception '自分の請求だけ報告できます';
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
create trigger payment_reports_before_insert before insert on public.payment_reports
  for each row execute function public.before_payment_report_insert();

-- 承認すると「支払い済み」、差し戻すと「未納」に戻る（理由は必須）
create or replace function public.before_payment_report_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.result = old.result then
    return new;
  end if;
  if old.result <> 'pending' then
    raise exception '確認済みの報告は変更できません';
  end if;
  if new.result = 'rejected' and coalesce(btrim(new.rejected_reason), '') = '' then
    raise exception '差し戻しの理由を入力してください';
  end if;
  new.reviewed_by := public.current_member_id();
  new.reviewed_at := now();
  update public.bill_items
     set status = case new.result when 'approved' then 'paid'::public.bill_item_status
                                  else 'unpaid'::public.bill_item_status end
   where id = new.bill_item_id;
  return new;
end $$;
create trigger payment_reports_before_update before update on public.payment_reports
  for each row execute function public.before_payment_report_review();

-- 大会エントリー：部員は締切前の「希望」だけ。確定は主将・副将
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
  if (tg_op = 'INSERT' and cardinality(new.confirmed_dances) > 0)
     or (tg_op = 'UPDATE' and new.confirmed_dances <> old.confirmed_dances) then
    raise exception '確定は主将・副将だけができます';
  end if;
  if exists (
       select 1 from unnest(new.requested_dances) d
       where d not in (select dance from public.competition_dances where competition_id = new.competition_id)) then
    raise exception 'この大会で実施しない種目が含まれています';
  end if;
  return new;
end $$;
create trigger entries_guard before insert or update or delete on public.entries
  for each row execute function public.guard_entries();

-- 備品の借用：部員は自分名義の「申請」だけ作れる
create or replace function public.guard_loan_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.has_role('equipment') then
    return new;
  end if;
  if new.borrower_id is distinct from public.current_member_id() then
    raise exception '自分の名前でしか申請できません';
  end if;
  new.status := 'requested';
  new.lent_on := null;
  new.returned_on := null;
  return new;
end $$;
create trigger loans_guard_insert before insert on public.loans
  for each row execute function public.guard_loan_insert();

-- ---------- 集計（主将・副将・財務向け） ----------
-- 個人の金額は見せず、請求ごとの人数と金額だけを返す
create or replace function public.bill_summaries()
returns table (
  bill_id uuid, title text, due_date date,
  total_count int, paid_count int, pending_count int, unpaid_count int,
  total_amount int, paid_amount int
)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.due_date,
         count(i.*)::int,
         count(*) filter (where i.status = 'paid')::int,
         count(*) filter (where i.status = 'pending')::int,
         count(*) filter (where i.status = 'unpaid')::int,
         coalesce(sum(i.amount) filter (where i.status <> 'waived'), 0)::int,
         coalesce(sum(i.amount) filter (where i.status = 'paid'), 0)::int
  from public.bills b
  left join public.bill_items i on i.bill_id = b.id
  where public.has_role('captain', 'vice_captain', 'treasurer')
  group by b.id
  order by b.due_date nulls last
$$;

-- =============================================================
-- RLS（行ごとの読み書きルール）
-- =============================================================
alter table public.members            enable row level security;
alter table public.member_roles       enable row level security;
alter table public.grade_permissions  enable row level security;
alter table public.invites            enable row level security;
alter table public.events             enable row level security;
alter table public.announcements      enable row level security;
alter table public.competitions       enable row level security;
alter table public.competition_dances enable row level security;
alter table public.entries            enable row level security;
alter table public.bills              enable row level security;
alter table public.bill_items         enable row level security;
alter table public.payment_reports    enable row level security;
alter table public.equipment          enable row level security;
alter table public.loans              enable row level security;
alter table public.push_subscriptions enable row level security;

-- ログインしていない人には何も渡さない
revoke all on all tables in schema public from anon;

-- ---------- 部員 ----------
-- 自分の行だけは引退後も読める（アプリで「引退済み」と表示するため）
create policy members_select on public.members for select to authenticated
  using (public.is_active_member() or auth_user_id = auth.uid());
create policy members_update on public.members for update to authenticated
  using ((auth_user_id = auth.uid() and status = 'active') or public.has_role('admin'))
  with check ((auth_user_id = auth.uid()) or public.has_role('admin'));
create policy members_admin_insert on public.members for insert to authenticated
  with check (public.has_role('admin'));
create policy members_admin_delete on public.members for delete to authenticated
  using (public.has_role('admin'));

create policy member_roles_select on public.member_roles for select to authenticated
  using (public.is_active_member());
create policy member_roles_admin on public.member_roles for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy grade_permissions_select on public.grade_permissions for select to authenticated
  using (public.is_active_member());
create policy grade_permissions_admin on public.grade_permissions for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy invites_admin on public.invites for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- ---------- 予定・お知らせ ----------
create policy events_select on public.events for select to authenticated
  using (public.is_active_member() and public.is_target(target_grades));
create policy events_write on public.events for all to authenticated
  using (public.has_role('captain', 'vice_captain') or (public.is_active_member() and public.grade_can('schedule.edit')))
  with check (public.has_role('captain', 'vice_captain') or (public.is_active_member() and public.grade_can('schedule.edit')));

create policy announcements_select on public.announcements for select to authenticated
  using (public.is_active_member() and public.is_target(target_grades)
         and (expires_at is null or expires_at > now() or public.is_officer()));
create policy announcements_write on public.announcements for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- ---------- 大会 ----------
create policy competitions_select on public.competitions for select to authenticated
  using (public.is_active_member() and public.is_target(target_grades));
create policy competitions_write on public.competitions for all to authenticated
  using (public.has_role('captain', 'vice_captain')) with check (public.has_role('captain', 'vice_captain'));

create policy competition_dances_select on public.competition_dances for select to authenticated
  using (public.is_active_member());
create policy competition_dances_write on public.competition_dances for all to authenticated
  using (public.has_role('captain', 'vice_captain')) with check (public.has_role('captain', 'vice_captain'));

create policy entries_select on public.entries for select to authenticated
  using (public.is_active_member());
create policy entries_write on public.entries for all to authenticated
  using (public.has_role('captain', 'vice_captain')
         or (public.is_active_member() and public.current_member_id() in (leader_id, partner_id)))
  with check (public.has_role('captain', 'vice_captain')
         or (public.is_active_member() and public.current_member_id() in (leader_id, partner_id)));

-- ---------- 財務 ----------
create policy bills_select on public.bills for select to authenticated
  using (public.is_active_member() and (public.is_target(target_grades)
         or exists (select 1 from public.bill_items i where i.bill_id = bills.id and i.member_id = public.current_member_id())));
create policy bills_write on public.bills for all to authenticated
  using (public.has_role('treasurer')) with check (public.has_role('treasurer'));

create policy bill_items_select on public.bill_items for select to authenticated
  using ((public.is_active_member() and member_id = public.current_member_id()) or public.has_role('treasurer'));
create policy bill_items_write on public.bill_items for all to authenticated
  using (public.has_role('treasurer')) with check (public.has_role('treasurer'));

create policy payment_reports_select on public.payment_reports for select to authenticated
  using (public.has_role('treasurer') or exists (
           select 1 from public.bill_items i
           where i.id = bill_item_id and i.member_id = public.current_member_id()));
create policy payment_reports_insert on public.payment_reports for insert to authenticated
  with check (public.is_active_member());
create policy payment_reports_review on public.payment_reports for update to authenticated
  using (public.has_role('treasurer')) with check (public.has_role('treasurer'));

-- ---------- 備品 ----------
create policy equipment_select on public.equipment for select to authenticated
  using (public.is_active_member());
create policy equipment_write on public.equipment for all to authenticated
  using (public.has_role('equipment')) with check (public.has_role('equipment'));

create policy loans_select on public.loans for select to authenticated
  using (public.is_active_member());
create policy loans_request on public.loans for insert to authenticated
  with check (public.is_active_member());
create policy loans_manage on public.loans for update to authenticated
  using (public.has_role('equipment')) with check (public.has_role('equipment'));
create policy loans_delete on public.loans for delete to authenticated
  using (public.has_role('equipment')
         or (borrower_id = public.current_member_id() and status = 'requested'));

-- ---------- 通知 ----------
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (member_id = public.current_member_id())
  with check (member_id = public.current_member_id());
