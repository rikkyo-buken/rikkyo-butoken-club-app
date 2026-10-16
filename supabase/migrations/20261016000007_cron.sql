-- =============================================================
-- 舞研アプリ：毎朝9時（日本時間）の自動チェックを登録する
-- pg_cron は Supabase では使えるが、ローカルのテスト環境にはないので、ある場合だけ登録する
-- =============================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    -- 毎日 0:00 UTC ＝ 9:00 JST。同じ名前で登録し直すと上書きされる
    perform cron.schedule('daily-reminders', '0 0 * * *', 'select public.daily_reminders()');
  else
    raise notice 'pg_cron がないため、毎朝の自動チェックは登録していません';
  end if;
end $$;
