-- =============================================================
-- 舞研アプリ：通知が作られたら、プッシュ通知の送信関数（send-push）を呼ぶ
-- （ダッシュボードの「Database Webhooks」の代わりに、SQLだけで設定する）
--
-- 送り先は app_config に登録する。未登録なら何もしない。
--   insert into public.app_config (key, value) values
--     ('push_function_url', 'https://<プロジェクトID>.supabase.co/functions/v1/send-push'),
--     ('push_function_key', '<anon キー>')
--   on conflict (key) do update set value = excluded.value;
-- anon キーは公開してよい値。send-push は通知IDしか受け取らず、送信済みは送らないので安全
-- =============================================================

-- 部員からは見えない設定置き場（RLSを有効にしてポリシーを作らない＝アプリからは読めない）
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- pg_net（データベースからHTTPを送る仕組み）。Supabase にはある。ローカルのテストにはない
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

create or replace function public.on_notification_insert_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_key text;
begin
  if to_regnamespace('net') is null then
    return new;
  end if;
  select value into v_url from public.app_config where key = 'push_function_url';
  select value into v_key from public.app_config where key = 'push_function_key';
  if v_url is null or v_key is null then
    return new;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url,
          jsonb_build_object('id', new.id),
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key, 'apikey', v_key);
  return new;
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.on_notification_insert_push();
