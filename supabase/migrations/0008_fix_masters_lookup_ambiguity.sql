-- Тот же класс бага в третий раз: "from public.masters where id = ..."
-- без псевдонима таблицы конфликтует с OUT-параметром id. В 0004 это уже
-- чинилось для create_booking, но при переписывании в 0007 (добавление
-- денормализации имени клиента) квалификация потерялась, и та же ошибка
-- появилась в create_manual_booking. Фиксируем оба раза явным алиасом.
create or replace function public.create_booking(
  p_business_id uuid,
  p_master_id uuid,
  p_service_id uuid,
  p_date date,
  p_start text
)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, price numeric, service_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hh int;
  v_mm int;
  v_start_min int;
  v_service record;
  v_master_business uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_existing record;
  v_new_id uuid;
  v_client_name text;
  v_client_phone text;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  if p_start !~ '^([01]\d|2[0-3]):([0-5]\d)$' then
    raise exception 'Неверный формат времени' using errcode = '22023';
  end if;
  v_hh := split_part(p_start, ':', 1)::int;
  v_mm := split_part(p_start, ':', 2)::int;
  v_start_min := v_hh * 60 + v_mm;

  select m.business_id into v_master_business from public.masters m where m.id = p_master_id;
  if v_master_business is null or v_master_business <> p_business_id then
    raise exception 'Мастер не найден в этом бизнесе' using errcode = 'P0002';
  end if;

  select s.id, s.name, s.price, s.duration_min into v_service
  from public.services s
  where s.id = p_service_id and s.business_id = p_business_id and s.active;
  if v_service.id is null then
    raise exception 'Услуга не найдена в этом бизнесе' using errcode = 'P0002';
  end if;

  select p.name, p.phone into v_client_name, v_client_phone from public.profiles p where p.id = v_uid;

  v_starts_at := public.baku_local_to_utc(p_date, v_start_min);
  v_ends_at := v_starts_at + make_interval(mins => v_service.duration_min);

  select b.id, b.starts_at, b.ends_at, b.price, b.service_name into v_existing
  from public.bookings b
  where b.client_id = v_uid and b.master_id = p_master_id and b.starts_at = v_starts_at and b.status = 'confirmed';
  if v_existing.id is not null then
    id := v_existing.id; starts_at := v_existing.starts_at; ends_at := v_existing.ends_at;
    price := v_existing.price; service_name := v_existing.service_name;
    return next;
    return;
  end if;

  begin
    insert into public.bookings (
      client_id, client_name, client_phone, business_id, master_id, service_id, service_name, price,
      starts_at, ends_at, status, created_by
    ) values (
      v_uid, v_client_name, v_client_phone, p_business_id, p_master_id, p_service_id, v_service.name, v_service.price,
      v_starts_at, v_ends_at, 'confirmed', 'client'
    ) returning bookings.id into v_new_id;
  exception when exclusion_violation then
    raise exception 'Этот слот уже занят — обновите доступное время' using errcode = '23P01';
  end;

  id := v_new_id; starts_at := v_starts_at; ends_at := v_ends_at;
  price := v_service.price; service_name := v_service.name;
  return next;
end;
$$;

create or replace function public.create_manual_booking(
  p_business_id uuid,
  p_master_id uuid,
  p_service_id uuid,
  p_date date,
  p_start text,
  p_client_name text,
  p_client_phone text default null
)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hh int;
  v_mm int;
  v_start_min int;
  v_service record;
  v_master_business uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  if not exists (select 1 from public.business_members bm where bm.business_id = p_business_id and bm.user_id = v_uid) then
    raise exception 'Вы не сотрудник этого бизнеса' using errcode = '42501';
  end if;
  if p_client_name is null or length(trim(p_client_name)) < 1 then
    raise exception 'Укажите имя клиента' using errcode = '22023';
  end if;
  if p_start !~ '^([01]\d|2[0-3]):([0-5]\d)$' then
    raise exception 'Неверный формат времени' using errcode = '22023';
  end if;
  v_hh := split_part(p_start, ':', 1)::int;
  v_mm := split_part(p_start, ':', 2)::int;
  v_start_min := v_hh * 60 + v_mm;

  select m.business_id into v_master_business from public.masters m where m.id = p_master_id;
  if v_master_business is null or v_master_business <> p_business_id then
    raise exception 'Мастер не найден в этом бизнесе' using errcode = 'P0002';
  end if;

  select s.id, s.name, s.price, s.duration_min into v_service
  from public.services s where s.id = p_service_id and s.business_id = p_business_id and s.active;
  if v_service.id is null then
    raise exception 'Услуга не найдена в этом бизнесе' using errcode = 'P0002';
  end if;

  v_starts_at := public.baku_local_to_utc(p_date, v_start_min);
  v_ends_at := v_starts_at + make_interval(mins => v_service.duration_min);

  begin
    insert into public.bookings (
      client_id, client_name, client_phone, business_id, master_id, service_id, service_name, price,
      starts_at, ends_at, status, created_by
    ) values (
      null, trim(p_client_name), p_client_phone, p_business_id, p_master_id, p_service_id, v_service.name, v_service.price,
      v_starts_at, v_ends_at, 'confirmed', 'business'
    ) returning bookings.id into v_new_id;
  exception when exclusion_violation then
    raise exception 'Этот слот уже занят — обновите доступное время' using errcode = '23P01';
  end;

  id := v_new_id; starts_at := v_starts_at; ends_at := v_ends_at;
  return next;
end;
$$;
