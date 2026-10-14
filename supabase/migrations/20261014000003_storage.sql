-- =============================================================
-- 舞研アプリ：備品写真の保存場所（Supabase Storage）
-- 非公開バケット。在籍部員は閲覧、備品管理だけがアップロード・削除できる。
-- 写真は画面側で長辺1200px程度に縮めてからアップロードする。
-- =============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment-photos', 'equipment-photos', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy equipment_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'equipment-photos' and public.is_active_member());

create policy equipment_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'equipment-photos' and public.has_role('equipment'));

create policy equipment_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'equipment-photos' and public.has_role('equipment'));

create policy equipment_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'equipment-photos' and public.has_role('equipment'));
