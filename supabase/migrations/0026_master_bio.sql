-- Профиль мастера для клиентов: «о себе» (bio) и аватар, которые мастер с
-- собственным логином (0022) может править сам.
--
-- С 0022 писать в masters и в storage master/<id>/ может только владелец
-- салона. Мастеру открываем ровно две вещи — своё фото и своё bio — через
-- RPC, а не через UPDATE-политику: иначе ему пришлось бы разрешить и имя,
-- и active, и перенос в другой салон.

alter table public.masters
  add column bio text not null default '' check (char_length(bio) <= 500);

-- Мастер загружает файл в свою папку master/<свой id>/.
drop policy "photos_master_write" on storage.objects;
create policy "photos_master_write" on storage.objects
  for all using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'master'
    and exists (
      select 1 from public.masters m
      where m.id = ((storage.foldername(name))[2])::uuid
        and (public.is_business_owner(m.business_id) or m.user_id = auth.uid())
    )
  ) with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'master'
    and exists (
      select 1 from public.masters m
      where m.id = ((storage.foldername(name))[2])::uuid
        and (public.is_business_owner(m.business_id) or m.user_id = auth.uid())
    )
  );

-- p_photo_url = null — фото не трогаем. Ссылка обязана указывать в папку
-- этого мастера в нашем storage: подставить чужую картинку нельзя.
create function public.update_my_master_profile(p_bio text, p_photo_url text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_master_id uuid;
begin
  select m.id into v_master_id from public.masters m where m.user_id = auth.uid() limit 1;
  if v_master_id is null then
    raise exception 'Профиль мастера не найден' using errcode = '42501';
  end if;
  if char_length(coalesce(p_bio, '')) > 500 then
    raise exception 'О себе — не больше 500 символов' using errcode = '22023';
  end if;
  if p_photo_url is not null and position(('/object/public/photos/master/' || v_master_id || '/') in p_photo_url) = 0 then
    raise exception 'Недопустимая ссылка на фото' using errcode = '22023';
  end if;

  update public.masters m
  set bio = trim(coalesce(p_bio, '')),
      photo_url = coalesce(p_photo_url, m.photo_url)
  where m.id = v_master_id;
end;
$$;

revoke all on function public.update_my_master_profile from public;
grant execute on function public.update_my_master_profile to authenticated;
