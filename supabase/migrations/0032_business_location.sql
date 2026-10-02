-- Адрес салона на карте.
--
-- До этой миграции у салона был только текстовый адрес: кнопка «Маршрут»
-- открывала карточку салона, карты не было. Теперь владелец отмечает салон
-- на карте (business-location/[businessId].jsx), клиент видит мини-карту в
-- карточке, салоны на карте в поиске и строит маршрут в навигаторе.
--
-- Отметка на карте — новый обязательный пункт чек-листа публикации (0024):
-- без координат клиент не доберётся. Уже опубликованные салоны не
-- затрагиваются — publish_business проверяет чек-лист только до публикации.

alter table public.businesses
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add constraint businesses_location_pair check ((lat is null) = (lng is null));

-- Чек-лист (0024): пункт location.
create or replace function public.business_setup_status(p_business_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_description text;
  v_published_at timestamptz;
  v_has_location boolean;
  v_photos int;
  v_masters boolean;
  v_schedule boolean;
  v_services boolean;
begin
  if not (public.is_business_member(p_business_id) or public.is_platform_admin()) then
    raise exception 'Нет доступа к этому салону' using errcode = '42501';
  end if;

  select b.description, b.published_at, b.lat is not null and b.lng is not null
    into v_description, v_published_at, v_has_location
  from public.businesses b where b.id = p_business_id;
  if not found then
    raise exception 'Салон не найден' using errcode = '22023';
  end if;

  select count(*)::int into v_photos from public.business_photos p where p.business_id = p_business_id;

  select exists (
    select 1 from public.masters m where m.business_id = p_business_id and m.active
  ) into v_masters;

  select exists (
    select 1 from public.masters m
    join public.master_schedule ms on ms.master_id = m.id
    where m.business_id = p_business_id and m.active
  ) into v_schedule;

  -- Услуга засчитывается, только если по ней реально можно записаться:
  -- активная, с активным мастером, у которого есть рабочие часы.
  select exists (
    select 1 from public.services s
    join public.service_masters sm on sm.service_id = s.id
    join public.masters m on m.id = sm.master_id and m.active
    where s.business_id = p_business_id and s.active
      and exists (select 1 from public.master_schedule ms where ms.master_id = m.id)
  ) into v_services;

  return jsonb_build_object(
    'description', length(trim(coalesce(v_description, ''))) >= 30,
    'photos', v_photos >= 1,
    'photos_count', v_photos,
    'masters', v_masters,
    'schedule', v_schedule,
    'services', v_services,
    'location', v_has_location,
    'published', v_published_at is not null
  );
end;
$$;


-- Публикация (0025): без отметки на карте не публикуется.
create or replace function public.publish_business(p_business_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status jsonb;
  v_missing text[] := '{}';
  v_published_at timestamptz;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Опубликовать салон может только владелец' using errcode = '42501';
  end if;

  select b.published_at into v_published_at from public.businesses b where b.id = p_business_id;
  if v_published_at is not null then
    return v_published_at;
  end if;

  v_status := public.business_setup_status(p_business_id);
  if not (v_status->>'description')::boolean then v_missing := array_append(v_missing, 'описание (от 30 символов)'); end if;
  if not (v_status->>'location')::boolean then v_missing := array_append(v_missing, 'адрес на карте'); end if;
  if not (v_status->>'photos')::boolean then v_missing := array_append(v_missing, 'фото салона'); end if;
  if not (v_status->>'masters')::boolean then v_missing := array_append(v_missing, 'мастера'); end if;
  if not (v_status->>'schedule')::boolean then v_missing := array_append(v_missing, 'расписание мастера'); end if;
  if not (v_status->>'services')::boolean then v_missing := array_append(v_missing, 'услуги с мастером'); end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Чтобы опубликовать салон, добавьте: %', array_to_string(v_missing, ', ')
      using errcode = '22023';
  end if;

  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.businesses set published_at = now() where id = p_business_id
  returning published_at into v_published_at;
  return v_published_at;
end;
$$;

