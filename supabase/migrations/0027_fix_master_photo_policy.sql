-- Баг в photos_master_write (0012 → 0022 → 0026): внутри подзапроса
-- `exists (select 1 from public.masters m ...)` неуточнённое `name`
-- разрешалось в masters.name (имя мастера), а не в storage.objects.name
-- (путь файла). storage.foldername('Мастер A')[2] = null — политика не
-- пропускала ни одну загрузку фото мастера: ни владельцу, ни самому мастеру.
-- Уточняем objects.name явно.
drop policy "photos_master_write" on storage.objects;
create policy "photos_master_write" on storage.objects
  for all using (
    bucket_id = 'photos'
    and (storage.foldername(objects.name))[1] = 'master'
    and exists (
      select 1 from public.masters m
      where m.id = ((storage.foldername(objects.name))[2])::uuid
        and (public.is_business_owner(m.business_id) or m.user_id = auth.uid())
    )
  ) with check (
    bucket_id = 'photos'
    and (storage.foldername(objects.name))[1] = 'master'
    and exists (
      select 1 from public.masters m
      where m.id = ((storage.foldername(objects.name))[2])::uuid
        and (public.is_business_owner(m.business_id) or m.user_id = auth.uid())
    )
  );
