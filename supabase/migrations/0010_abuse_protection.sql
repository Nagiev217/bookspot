-- Защита от злоупотребления: без этого один клиент мог занять бизнесу
-- неограниченное число слотов или отменить/перенести бронь за минуту до
-- визита. cancel_window_hours уже был в схеме businesses (0001_init.sql),
-- но нигде не читался — здесь наконец применяется.

-- 1) Не больше 3 будущих подтверждённых броней клиента в одном бизнесе.
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
  v_active_count int;
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

  select count(*) into v_active_count from public.bookings b
  where b.client_id = v_uid and b.business_id = p_business_id and b.status = 'confirmed' and b.starts_at > now();
  if v_active_count >= 3 then
    raise exception 'У вас уже 3 активные записи в этом салоне — дождитесь визита или отмените одну' using errcode = 'P0001';
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

-- 2) cancel_window_hours: клиент (не сотрудник бизнеса) не может отменить
-- или перенести бронь позже, чем за N часов до визита. Сотрудник может
-- всегда — клиент мог позвонить и попросить отменить в последний момент.
create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_cancel_window_hours int;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;

  select b.* into v_booking from public.bookings b where b.id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Бронь не найдена' using errcode = 'P0002';
  end if;

  perform public.require_booking_access(v_booking, v_uid);

  if v_booking.status <> 'confirmed' then
    raise exception 'Эту бронь уже нельзя отменить' using errcode = '22023';
  end if;

  if v_booking.client_id = v_uid then
    select biz.cancel_window_hours into v_cancel_window_hours from public.businesses biz where biz.id = v_booking.business_id;
    if now() > v_booking.starts_at - make_interval(hours => v_cancel_window_hours) then
      raise exception 'Отменить можно не позднее чем за % ч. до визита — позвоните в салон', v_cancel_window_hours using errcode = '22023';
    end if;
  end if;

  update public.bookings set status = 'cancelled' where id = p_booking_id;
end;
$$;

create or replace function public.reschedule_booking(p_booking_id uuid, p_date date, p_start text)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_hh int;
  v_mm int;
  v_start_min int;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration int;
  v_cancel_window_hours int;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  if p_start !~ '^([01]\d|2[0-3]):([0-5]\d)$' then
    raise exception 'Неверный формат времени' using errcode = '22023';
  end if;

  select b.* into v_booking from public.bookings b where b.id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Бронь не найдена' using errcode = 'P0002';
  end if;

  perform public.require_booking_access(v_booking, v_uid);

  if v_booking.status <> 'confirmed' then
    raise exception 'Эту бронь уже нельзя перенести' using errcode = '22023';
  end if;

  if v_booking.client_id = v_uid then
    select biz.cancel_window_hours into v_cancel_window_hours from public.businesses biz where biz.id = v_booking.business_id;
    if now() > v_booking.starts_at - make_interval(hours => v_cancel_window_hours) then
      raise exception 'Перенести можно не позднее чем за % ч. до визита — позвоните в салон', v_cancel_window_hours using errcode = '22023';
    end if;
  end if;

  v_hh := split_part(p_start, ':', 1)::int;
  v_mm := split_part(p_start, ':', 2)::int;
  v_start_min := v_hh * 60 + v_mm;
  v_duration := extract(epoch from (v_booking.ends_at - v_booking.starts_at))::int / 60;

  v_starts_at := public.baku_local_to_utc(p_date, v_start_min);
  v_ends_at := v_starts_at + make_interval(mins => v_duration);

  begin
    update public.bookings
    set starts_at = v_starts_at, ends_at = v_ends_at
    where public.bookings.id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'Этот слот уже занят — выберите другое время' using errcode = '23P01';
  end;

  id := p_booking_id; starts_at := v_starts_at; ends_at := v_ends_at;
  return next;
end;
$$;
