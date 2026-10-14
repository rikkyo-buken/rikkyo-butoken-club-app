-- 権限ルールのテスト。素のPostgresに supabase_stub.sql → migrations → このファイルの順で流す。
-- 失敗すると例外で止まる。
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- ---------- テスト用の人物 ----------
-- 2026年度時点：2023入部=4年、2024入部=3年、2025入部=2年、2026入部=1年
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'admin@x'),
  ('00000000-0000-0000-0000-00000000000c', 'cap@x'),
  ('00000000-0000-0000-0000-00000000000f', 'tre@x'),
  ('00000000-0000-0000-0000-000000000001', 'm1@x'),
  ('00000000-0000-0000-0000-000000000002', 'm2@x'),
  ('00000000-0000-0000-0000-0000000000ee', 'ret@x'),
  ('00000000-0000-0000-0000-0000000000ff', 'new@x');

insert into public.members (id, auth_user_id, full_name, nickname, join_year, major, position, status) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '管理 太郎', 'かんり', 2023, 'latin', 'leader', 'active'),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', '主将 次郎', 'しゅしょう', 2024, 'standard', 'leader', 'active'),
  ('10000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000f', '財務 花子', 'ざいむ', 2024, 'latin', 'partner', 'active'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '一年 一郎', 'いち', 2026, 'latin', 'leader', 'active'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '二年 二子', 'に', 2025, 'latin', 'partner', 'active'),
  ('10000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000ee', '引退 先輩', 'せんぱい', 2022, 'latin', 'leader', 'retired');

insert into public.member_roles values
  ('10000000-0000-0000-0000-00000000000a', 'admin'),
  ('10000000-0000-0000-0000-00000000000c', 'captain'),
  ('10000000-0000-0000-0000-00000000000f', 'treasurer');

insert into public.invites (token, max_uses) values ('valid-token', 5);
insert into public.invites (token, expires_at) values ('expired-token', now() - interval '1 day');

-- ---------- テスト用の道具 ----------
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  execute 'set role authenticated';
end $$;

-- 実行してエラーになることを確認する
create function pg_temp.must_fail(p_label text, p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK  (拒否) %: %', p_label, sqlerrm;
    return;
  end;
  raise exception 'NG  拒否されるべきなのに通った: %', p_label;
end $$;

-- 更新・削除で実際に変わった行数を返す
create function pg_temp.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

create function pg_temp.must_equal(p_label text, p_got bigint, p_want bigint) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'NG  %: % 件のはずが % 件', p_label, p_want, p_got;
  end if;
  raise notice 'OK  %', p_label;
end $$;

set client_min_messages = notice;

-- ===== 1. 予定：学年別の編集権限と対象学年 =====
insert into public.events (id, title, starts_at, ends_at, target_grades) values
  ('20000000-0000-0000-0000-000000000001', '全体練習', now(), now() + interval '2 hours', null),
  ('20000000-0000-0000-0000-000000000002', '2年以上ミーティング', now(), now() + interval '1 hour', '{2,3,4}');

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');  -- 1年
select pg_temp.must_fail('1年は予定を追加できない',
  $q$insert into public.events (title, starts_at, ends_at) values ('x', now(), now() + interval '1 hour')$q$);
select pg_temp.must_equal('1年には2年以上向けの予定が見えない', (select count(*) from public.events), 1);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-000000000002');  -- 2年
insert into public.events (title, starts_at, ends_at) values ('2年が追加', now(), now() + interval '1 hour');
select pg_temp.must_equal('2年は予定を追加でき、全件見える', (select count(*) from public.events), 3);
reset role;

-- ===== 2. 引退者・未登録者・未ログイン =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ee');
select pg_temp.must_equal('引退者は予定を見られない', (select count(*) from public.events), 0);
select pg_temp.must_equal('引退者は自分の行だけ読める（引退表示用）', (select count(*) from public.members), 1);
select pg_temp.must_fail('引退者はプロフィールを変更できない',
  $q$do $d$ begin update public.members set nickname = 'x' where auth_user_id = auth.uid();
     if not found then raise exception '0 rows'; end if; end $d$$q$);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ff');  -- 未登録
select pg_temp.must_equal('未登録者は部員一覧を見られない', (select count(*) from public.members), 0);
select pg_temp.must_fail('期限切れの招待では登録できない',
  $q$select public.register_member('expired-token', '新入 部員', 'しん', 2026, 'latin', 'partner')$q$);
select pg_temp.must_fail('存在しない招待では登録できない',
  $q$select public.register_member('nope', '新入 部員', 'しん', 2026, 'latin', 'partner')$q$);
select public.register_member('valid-token', '新入 部員', 'しん', 2026, 'latin', 'partner');
select pg_temp.must_equal('有効な招待で登録すると部員一覧が見える（引退者含む7人）', (select count(*) from public.members), 7);
select pg_temp.must_fail('二重登録はできない',
  $q$select public.register_member('valid-token', '新入 部員', 'しん', 2026, 'latin', 'partner')$q$);
reset role;
select pg_temp.must_equal('招待の使用回数が1増える', (select used_count from public.invites where token = 'valid-token'), 1);

set role anon;
select pg_temp.must_fail('未ログインは何も読めない', $q$select count(*) from public.events$q$);
reset role;

-- ===== 3. プロフィール =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
update public.members set nickname = 'いっちゃん' where auth_user_id = auth.uid();
select pg_temp.must_equal('自分のニックネームは変更できる',
  (select count(*) from public.members where nickname = 'いっちゃん'), 1);
select pg_temp.must_fail('自分の入部年度は変更できない（学年＝権限が変わるため）',
  $q$update public.members set join_year = 2023 where auth_user_id = auth.uid()$q$);
select pg_temp.must_fail('自分に役職は付けられない',
  $q$insert into public.member_roles values ('10000000-0000-0000-0000-000000000001', 'admin')$q$);
reset role;

-- ===== 4. 財務：請求・支払い報告・承認 =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');  -- 財務
insert into public.bills (id, kind, title, due_date) values
  ('30000000-0000-0000-0000-000000000001', 'camp_event', '秋合宿費', current_date + 7);
insert into public.bill_items (id, bill_id, member_id, amount) values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 6000),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 8000);
select pg_temp.must_equal('財務は全員分の請求額が見える', (select count(*) from public.bill_items), 2);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');  -- 1年
select pg_temp.must_equal('部員は自分の請求額だけ見える', (select count(*) from public.bill_items), 1);
select pg_temp.must_fail('部員は請求を作れない',
  $q$insert into public.bills (kind, title) values ('dues', 'x')$q$);
select pg_temp.must_equal('部員は自分の請求を「支払い済み」に書き換えられない（0件更新）',
  pg_temp.affected($q$update public.bill_items set status = 'paid'$q$), 0);
select pg_temp.must_fail('他人の請求は報告できない',
  $q$insert into public.payment_reports (bill_item_id, method) values ('31000000-0000-0000-0000-000000000002', 'cash')$q$);
insert into public.payment_reports (id, bill_item_id, method) values
  ('32000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'transfer');
select pg_temp.must_equal('報告すると「確認待ち」になる',
  (select count(*) from public.bill_items where status = 'pending'), 1);
select pg_temp.must_fail('同じ請求を二重に報告できない',
  $q$insert into public.payment_reports (bill_item_id, method) values ('31000000-0000-0000-0000-000000000001', 'cash')$q$);
select pg_temp.must_equal('部員は自分の報告を承認できない（0件更新）',
  pg_temp.affected($q$update public.payment_reports set result = 'approved'$q$), 0);
select pg_temp.must_equal('部員は集計を見られない', (select count(*) from public.bill_summaries()), 0);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');  -- 財務
select pg_temp.must_fail('理由なしでは差し戻せない',
  $q$update public.payment_reports set result = 'rejected' where id = '32000000-0000-0000-0000-000000000001'$q$);
update public.payment_reports set result = 'approved' where id = '32000000-0000-0000-0000-000000000001';
select pg_temp.must_equal('承認すると「支払い済み」になる',
  (select count(*) from public.bill_items where status = 'paid'), 1);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');  -- 主将
select pg_temp.must_equal('主将は個別の請求額を見られない', (select count(*) from public.bill_items), 0);
select pg_temp.must_equal('主将は集計を見られる（支払い済み1人）',
  (select paid_count from public.bill_summaries() limit 1), 1);
reset role;

-- ===== 5. 大会エントリー =====
insert into public.competitions (id, name, held_on, request_deadline, entry_fee) values
  ('40000000-0000-0000-0000-000000000001', '秋季大会', current_date + 30, now() + interval '5 days', 1250),
  ('40000000-0000-0000-0000-000000000002', '締切済み大会', current_date + 10, now() - interval '1 day', 1250);
insert into public.competition_dances values
  ('40000000-0000-0000-0000-000000000001', 'サンバ'), ('40000000-0000-0000-0000-000000000001', 'ルンバ'),
  ('40000000-0000-0000-0000-000000000002', 'サンバ');

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.entries (id, competition_id, leader_id, partner_id, requested_dances) values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '{サンバ,ルンバ}');
select pg_temp.must_equal('締切前なら希望を出せる', (select count(*) from public.entries), 1);
select pg_temp.must_fail('実施しない種目は希望できない',
  $q$update public.entries set requested_dances = '{ワルツ}' where id = '41000000-0000-0000-0000-000000000001'$q$);
select pg_temp.must_fail('部員は自分で確定できない',
  $q$update public.entries set status = 'confirmed' where id = '41000000-0000-0000-0000-000000000001'$q$);
select pg_temp.must_fail('締切後は希望を出せない',
  $q$insert into public.entries (competition_id, leader_id, partner_id, requested_dances) values
     ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '{サンバ}')$q$);
select pg_temp.must_fail('自分が入っていないカップルは登録できない',
  $q$insert into public.entries (competition_id, leader_id, partner_id) values
     ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000f')$q$);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');  -- 主将
update public.entries set status = 'confirmed', confirmed_dances = '{サンバ}'
 where id = '41000000-0000-0000-0000-000000000001';
select pg_temp.must_equal('主将は確定できる', (select count(*) from public.entries where status = 'confirmed'), 1);
reset role;

-- ===== 6. 備品・貸出 =====
insert into public.equipment (id, name) values ('50000000-0000-0000-0000-000000000001', 'ポータブルスピーカー');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.loans (equipment_id, borrower_id, status) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'lent');
select pg_temp.must_equal('借用は「申請中」として登録される（自分で貸出中にはできない）',
  (select count(*) from public.loans where status = 'requested'), 1);
select pg_temp.must_fail('他人名義で借用申請できない',
  $q$insert into public.loans (equipment_id, borrower_id) values
     ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')$q$);
select pg_temp.must_fail('部員は備品を登録できない',
  $q$insert into public.equipment (name) values ('x')$q$);
reset role;

-- ===== 段階2：大会の確定と請求 =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');  -- 1年
select pg_temp.must_fail('部員は組の金額を変えられない',
  $q$update public.entries set fee = 0 where id = '41000000-0000-0000-0000-000000000001'$q$);
select pg_temp.must_fail('部員は大会を確定できない',
  $q$select public.confirm_competition('40000000-0000-0000-0000-000000000001', current_date + 7)$q$);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');  -- 主将
update public.entries set fee = 3001 where id = '41000000-0000-0000-0000-000000000001';
select public.confirm_competition('40000000-0000-0000-0000-000000000001', current_date + 7);
select pg_temp.must_fail('同じ大会は二重に確定できない',
  $q$select public.confirm_competition('40000000-0000-0000-0000-000000000001', current_date + 7)$q$);
reset role;
select pg_temp.must_equal('確定でリーダーに半額（端数込み 1501円）が請求される',
  (select amount from public.bill_items i join public.bills b on b.id = i.bill_id
    where b.competition_id = '40000000-0000-0000-0000-000000000001' and i.member_id = '10000000-0000-0000-0000-000000000001'), 1501);
select pg_temp.must_equal('確定でパートナーに半額（1500円）が請求される',
  (select amount from public.bill_items i join public.bills b on b.id = i.bill_id
    where b.competition_id = '40000000-0000-0000-0000-000000000001' and i.member_id = '10000000-0000-0000-0000-000000000002'), 1500);
select pg_temp.must_equal('確定すると大会の状態が「確定」になる',
  (select count(*) from public.competitions where id = '40000000-0000-0000-0000-000000000001' and status = 'confirmed'), 1);

-- ===== 段階2：学年ごとの金額で請求 =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.must_fail('部員は請求を一括作成できない',
  $q$select public.create_bill('dues', '後期部費', current_date + 14, null, '{"1": 3000}'::jsonb)$q$);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');  -- 財務
select public.create_bill('dues', '後期部費', current_date + 14, null, '{"1": 3000, "2": 5000, "3": 5000, "4": 5000}'::jsonb);
select pg_temp.must_equal('在籍部員6人分の請求ができる（引退者は除く）',
  (select count(*) from public.bill_items i join public.bills b on b.id = i.bill_id where b.title = '後期部費'), 6);
select pg_temp.must_equal('1年には1年の金額（3000円）が入る',
  (select amount from public.bill_items i join public.bills b on b.id = i.bill_id
    where b.title = '後期部費' and i.member_id = '10000000-0000-0000-0000-000000000001'), 3000);
reset role;
select pg_temp.must_equal('5年目以上は4年生として扱う', public.grade_of(public.current_fiscal_year() - 6), 4);

-- ===== 段階2：振込先 =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.must_equal('部員は振込先を読める', (select count(*) from public.club_settings), 1);
select pg_temp.must_equal('部員は振込先を書き換えられない（0件更新）',
  pg_temp.affected($q$update public.club_settings set bank_info = 'x'$q$), 0);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.must_equal('財務は振込先を登録できる',
  pg_temp.affected($q$update public.club_settings set bank_info = '〇〇銀行 池袋支店 普通 1234567'$q$), 1);
reset role;

-- ===== 段階2：貸出の承認と返却 =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');  -- 管理者（備品管理の権限も持つ）
update public.loans set status = 'lent', due_on = current_date + 7 where status = 'requested';
select pg_temp.must_equal('貸出にすると貸出日が自動で入る',
  (select count(*) from public.loans where status = 'lent' and lent_on = current_date), 1);
update public.loans set status = 'returned' where status = 'lent';
select pg_temp.must_equal('返却にすると返却日が自動で入る',
  (select count(*) from public.loans where status = 'returned' and returned_on = current_date), 1);
reset role;

-- ===== 7. 管理者 =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.grade_permissions set allowed = true where grade = 1 and permission = 'schedule.edit';
select pg_temp.must_fail('最後の管理者は外せない',
  $q$delete from public.member_roles where role = 'admin'$q$);
update public.members set status = 'retired' where id = '10000000-0000-0000-0000-000000000002';
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.events (title, starts_at, ends_at) values ('1年が追加', now(), now() + interval '1 hour');
select pg_temp.must_equal('管理者が許可すると1年も予定を追加できる',
  (select count(*) from public.events where title = '1年が追加'), 1);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select pg_temp.must_equal('管理者が引退にすると、その人は何も見えなくなる', (select count(*) from public.events), 0);
reset role;

\echo '=== すべてのテストに合格 ==='
