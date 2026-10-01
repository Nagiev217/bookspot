-- Специализация и опыт мастера — поля с макета «Salon Booking App»
-- (подзаголовок «Barber · Atelier Nizami» и чип «Опыт 8 лет» на экране
-- профиля мастера). Дополняют bio из 0026.
--
-- experience_years — число, а не текст: склонение «год/года/лет» считает
-- клиент, иначе владелец напишет вразнобой («8 лет», «8 л.», «восемь»).

alter table public.masters
  add column specialty text not null default '' check (char_length(specialty) <= 40),
  add column experience_years int check (experience_years between 0 and 70);

-- Мастер правит свою публичную карточку сам (0026), теперь вместе со
-- специализацией и опытом. Сигнатура меняется, поэтому старую версию
-- сначала удаляем: create or replace с новыми параметрами создал бы вторую
-- перегрузку и вызов стал бы неоднозначным.
drop function public.update_my_master_profile(text, text);

create function public.update_my_master_profile(
  p_bio text,
  p_photo_url text default null,
  p_specialty text default '',
  p_experience_years int default null
)
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
  if char_length(trim(coalesce(p_specialty, ''))) > 40 then
    raise exception 'Специализация — не больше 40 символов' using errcode = '22023';
  end if;
  if p_experience_years is not null and (p_experience_years < 0 or p_experience_years > 70) then
    raise exception 'Опыт — от 0 до 70 лет' using errcode = '22023';
  end if;
  -- Фото обязано лежать в папке самого мастера: подставить чужую картинку нельзя.
  if p_photo_url is not null and position(('/object/public/photos/master/' || v_master_id || '/') in p_photo_url) = 0 then
    raise exception 'Недопустимая ссылка на фото' using errcode = '22023';
  end if;

  update public.masters m
  set bio = trim(coalesce(p_bio, '')),
      specialty = trim(coalesce(p_specialty, '')),
      experience_years = p_experience_years,
      photo_url = coalesce(p_photo_url, m.photo_url)
  where m.id = v_master_id;
end;
$$;

revoke all on function public.update_my_master_profile from public;
grant execute on function public.update_my_master_profile to authenticated;
