-- Публичный бакет для фото бизнеса/мастеров. Путь к файлу — сама граница
-- доступа: "business/<business_id>/..." и "master/<master_id>/...", политики
-- парсят business_id/master_id из имени объекта (storage.foldername), не
-- нужен отдельный реестр разрешённых файлов.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos_public_read" on storage.objects
  for select using (bucket_id = 'photos');

-- Участник бизнеса пишет/меняет/удаляет только в своей папке business/<id>/…
create policy "photos_business_write" on storage.objects
  for all using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'business'
    and exists (
      select 1 from public.business_members bm
      where bm.business_id = ((storage.foldername(name))[2])::uuid and bm.user_id = auth.uid()
    )
  ) with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'business'
    and exists (
      select 1 from public.business_members bm
      where bm.business_id = ((storage.foldername(name))[2])::uuid and bm.user_id = auth.uid()
    )
  );

-- Мастер: пишет в папку master/<master_id>/…, если состоит в бизнесе-владельце мастера.
create policy "photos_master_write" on storage.objects
  for all using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'master'
    and exists (
      select 1 from public.masters m
      join public.business_members bm on bm.business_id = m.business_id
      where m.id = ((storage.foldername(name))[2])::uuid and bm.user_id = auth.uid()
    )
  ) with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'master'
    and exists (
      select 1 from public.masters m
      join public.business_members bm on bm.business_id = m.business_id
      where m.id = ((storage.foldername(name))[2])::uuid and bm.user_id = auth.uid()
    )
  );
