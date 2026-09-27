-- create_booking/reschedule_booking/create_manual_booking до сих пор
-- сверялись только с EXCLUDE-constraint (пересечение с другой confirmed
-- бронью) — не с расписанием мастера вообще. Ключ anon лежит в клиенте и
-- легко извлекается, поэтому прямой вызов RPC позволял записаться в
-- прошлое, в нерабочие часы, в выходной (master_exceptions), и к мастеру,
-- не привязанному к услуге (service_masters игнорировался и здесь, и в
-- get_availability). UI никогда не предложил бы такой слот — но сервер
-- обязан проверять то же самое, что клиент, а не полагаться на его
-- добросовестность.
--
-- assert_slot_bookable — та же логика подсчёта свободных интервалов, что и
-- в get_availability (0003_availability.sql), но для одного конкретного
-- дня и с проверкой, что запрошенный интервал в него помещается
-- (int4range <@ int4multirange), а не перечисление всех слотов подряд.
create function public.assert_slot_bookable(
  p_master_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  -- reschedule_booking переносит уже существующую подтверждённую бронь —
  -- без исключения её собственная (ещё не обновлённая на момент проверки)
  -- строка попала бы в подсчёт занятости сама на себя и могла ложно
  -- отклонить перенос на соседнее время в тот же день у того же мастера.
  p_exclude_booking_id uuid default null
)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_buffer int;
  v_day date;
  v_dow int;
  v_start_min int;
  v_end_min int;
  v_work int4multirange;
  v_busy int4multirange;
  v_free int4multirange;
  v_exception record;
begin
  if p_starts_at <= now() then
    raise exception 'Нельзя записаться на прошедшее время' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.service_masters sm
    where sm.service_id = p_service_id and sm.master_id = p_master_id
  ) then
    raise exception 'Этот мастер не выполняет выбранную услугу' using errcode = 'P0002';
  end if;

  select b.buffer_min into v_buffer
  from public.masters m join public.businesses b on b.id = m.business_id
  where m.id = p_master_id;

  v_day := (p_starts_at at time zone 'Asia/Baku')::date;
  v_dow := extract(dow from v_day)::int;
  v_start_min := extract(hour from (p_starts_at at time zone 'Asia/Baku'))::int * 60
    + extract(minute from (p_starts_at at time zone 'Asia/Baku'))::int;
  v_end_min := extract(hour from (p_ends_at at time zone 'Asia/Baku'))::int * 60
    + extract(minute from (p_ends_at at time zone 'Asia/Baku'))::int;

  select e.* into v_exception from public.master_exceptions e
  where e.master_id = p_master_id and e.date = v_day;

  if v_exception.type = 'day_off' then
    v_work := '{}'::int4multirange;
  elsif v_exception.type = 'custom_hours' then
    select coalesce(range_agg(int4range(start_min, end_min)), '{}'::int4multirange)
      into v_work
    from public.master_exception_intervals
    where exception_id = v_exception.id;
  else
    select coalesce(range_agg(int4range(start_min, end_min)), '{}'::int4multirange)
      into v_work
    from public.master_schedule
    where master_id = p_master_id and day_of_week = v_dow;
  end if;

  select coalesce(
    range_agg(int4range(
      (extract(hour from (starts_at at time zone 'Asia/Baku'))::int * 60
        + extract(minute from (starts_at at time zone 'Asia/Baku'))::int),
      (extract(hour from (ends_at at time zone 'Asia/Baku'))::int * 60
        + extract(minute from (ends_at at time zone 'Asia/Baku'))::int) + v_buffer
    )),
    '{}'::int4multirange
  ) into v_busy
  from public.bookings
  where master_id = p_master_id
    and status = 'confirmed'
    and (starts_at at time zone 'Asia/Baku')::date = v_day
    and (p_exclude_booking_id is null or id <> p_exclude_booking_id);

  v_free := v_work - v_busy;

  if not (int4range(v_start_min, v_end_min) <@ v_free) then
    raise exception 'Этот мастер не работает в выбранное время' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.assert_slot_bookable from public;
grant execute on function public.assert_slot_bookable to authenticated;

-- get_availability и раньше не проверял service_masters — мог отдать
-- "свободные" слоты для пары мастер/услуга, которая не существует как
-- связка вообще. Один exists-check, остальная логика не тронута.
create or replace function public.get_availability(
  p_master_id uuid,
  p_service_id uuid,
  p_from date,
  p_days int default 7
)
returns table (slot_date date, slot_time text)
language plpgsql
stable
as $$
declare
  v_business_id uuid;
  v_slot_step int;
  v_buffer int;
  v_duration int;
  v_day date;
  v_dow int;
  v_work int4multirange;
  v_busy int4multirange;
  v_free int4multirange;
  v_exception record;
  v_range int4range;
  v_s int;
begin
  if p_days < 1 or p_days > 31 then
    raise exception 'p_days вне диапазона 1..31' using errcode = '22023';
  end if;

  select m.business_id, b.slot_step_min, b.buffer_min
    into v_business_id, v_slot_step, v_buffer
  from public.masters m
  join public.businesses b on b.id = m.business_id
  where m.id = p_master_id;

  if v_business_id is null then
    raise exception 'Мастер не найден' using errcode = 'P0002';
  end if;

  select duration_min into v_duration from public.services
  where id = p_service_id and business_id = v_business_id;

  if v_duration is null then
    raise exception 'Услуга не найдена в этом бизнесе' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.service_masters sm
    where sm.service_id = p_service_id and sm.master_id = p_master_id
  ) then
    raise exception 'Этот мастер не выполняет выбранную услугу' using errcode = 'P0002';
  end if;

  for v_day in select generate_series(p_from, p_from + (p_days - 1), interval '1 day')::date loop
    v_dow := extract(dow from v_day)::int;

    select e.* into v_exception from public.master_exceptions e
    where e.master_id = p_master_id and e.date = v_day;

    if v_exception.type = 'day_off' then
      v_work := '{}'::int4multirange;
    elsif v_exception.type = 'custom_hours' then
      select coalesce(range_agg(int4range(start_min, end_min)), '{}'::int4multirange)
        into v_work
      from public.master_exception_intervals
      where exception_id = v_exception.id;
    else
      select coalesce(range_agg(int4range(start_min, end_min)), '{}'::int4multirange)
        into v_work
      from public.master_schedule
      where master_id = p_master_id and day_of_week = v_dow;
    end if;

    select coalesce(
      range_agg(int4range(
        (extract(hour from (starts_at at time zone 'Asia/Baku'))::int * 60
          + extract(minute from (starts_at at time zone 'Asia/Baku'))::int),
        (extract(hour from (ends_at at time zone 'Asia/Baku'))::int * 60
          + extract(minute from (ends_at at time zone 'Asia/Baku'))::int) + v_buffer
      )),
      '{}'::int4multirange
    ) into v_busy
    from public.bookings
    where master_id = p_master_id
      and status = 'confirmed'
      and (starts_at at time zone 'Asia/Baku')::date = v_day;

    v_free := v_work - v_busy;

    for v_range in select unnest(v_free) loop
      v_s := (ceil(lower(v_range)::numeric / v_slot_step) * v_slot_step)::int;
      while v_s + v_duration <= upper(v_range) loop
        slot_date := v_day;
        slot_time := to_char(make_time(v_s / 60, v_s % 60, 0), 'HH24:MI');
        return next;
        v_s := v_s + v_slot_step;
      end loop;
    end loop;
  end loop;
end;
$$;

-- create_booking — та же версия, что в 0010_abuse_protection.sql, плюс
-- assert_slot_bookable сразу после того, как известны v_starts_at/v_ends_at
-- (после idempotency-проверки на повтор той же брони — она сама себе не
-- противоречит с расписанием, раз уже когда-то успешно создалась).
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

  perform public.assert_slot_bookable(p_master_id, p_service_id, v_starts_at, v_ends_at);

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

-- reschedule_booking — та же версия, что в 0010_abuse_protection.sql, плюс
-- assert_slot_bookable для НОВОГО слота (service_id берём из самой брони —
-- услуга при переносе не меняется, только дата/время).
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

  perform public.assert_slot_bookable(v_booking.master_id, v_booking.service_id, v_starts_at, v_ends_at, p_booking_id);

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

-- create_manual_booking — та же версия, что в 0008_fix_masters_lookup_ambiguity.sql,
-- плюс та же проверка. Бизнес создаёт бронь сам ("по звонку"), но мастер,
-- которого нет на месте, не должен получить запись и здесь — иначе в
-- календаре бизнеса появится визит, которого физически не может быть.
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

  perform public.assert_slot_bookable(p_master_id, p_service_id, v_starts_at, v_ends_at);

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
