-- Пункт 1 после сквозной проверки (scripts/journey.js):
--
-- 1. get_availability отдавал на сегодня уже прошедшие слоты (в 16:42 —
--    27 из 38); клиент выбирал 10:00 и получал ошибку. Теперь прошедшие
--    и слишком близкие слоты не выдаются.
-- 2. Минимальное время до записи — 1 час: иначе мастер должен подтвердить
--    заявку за минуты до визита. Запись «по звонку» салоном — без ограничения
--    (p_lead_minutes = 0 с экрана ручной записи).
-- 3. Ночные заявки сгорали: срок ответа 2 часа шёл и ночью — запись в 23:00
--    отменялась в 01:00, пока мастер спит. Теперь отсчёт ночью стоит:
--    с 22:00 до 09:00 по Баку часы не идут (request_deadline). Срок по-прежнему
--    не позже начала визита.

-- ─── Срок ответа на заявку ───────────────────────────────────────────────
-- p_now — для проверки ночных случаев (по умолчанию сейчас).
create function public.request_deadline(p_hours int, p_starts_at timestamptz, p_now timestamptz default now())
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Baku';
  v_left interval := make_interval(hours => p_hours);
  v_day_end timestamp;
begin
  -- Считаем только дневные часы 09:00–22:00: ночью отсчёт стоит.
  loop
    if v_local::time < time '09:00' then
      v_local := v_local::date + time '09:00';
    elsif v_local::time >= time '22:00' then
      v_local := (v_local::date + 1) + time '09:00';
    end if;
    v_day_end := v_local::date + time '22:00';
    exit when v_local + v_left <= v_day_end;
    v_left := v_left - (v_day_end - v_local);
    v_local := (v_local::date + 1) + time '09:00';
  end loop;
  return least((v_local + v_left) at time zone 'Asia/Baku', p_starts_at);
end;
$$;revoke execute on function public.request_deadline(int, timestamptz, timestamptz) from public, anon, authenticated;

-- ─── Свободные слоты ─────────────────────────────────────────────────────
drop function public.get_availability(uuid, uuid, date, int);
create function public.get_availability(
  p_master_id uuid,
  p_service_id uuid,
  p_from date,
  p_days int default 7,
  -- Минимум минут до начала. Клиенту — 60 (по умолчанию), салону при
  -- записи «по звонку» — 0: клиент уже стоит у стойки.
  p_lead_minutes int default 60
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
  v_min_local timestamp := (now() + make_interval(mins => greatest(coalesce(p_lead_minutes, 60), 0))) at time zone 'Asia/Baku';
  v_min_day date := v_min_local::date;
  v_min_min int := extract(hour from v_min_local)::int * 60 + ceil(extract(minute from v_min_local) + extract(second from v_min_local) / 60)::int;
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
    -- День целиком раньше минимального времени — пропускаем.
    continue when v_day < v_min_day;
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
      and status in ('pending', 'proposed', 'confirmed')
      and (starts_at at time zone 'Asia/Baku')::date = v_day;

    v_free := v_work - v_busy;

    for v_range in select unnest(v_free) loop
      v_s := (ceil(lower(v_range)::numeric / v_slot_step) * v_slot_step)::int;
      while v_s + v_duration <= upper(v_range) loop
        -- Сегодня — только слоты не раньше минимального времени.
        if v_day = v_min_day and v_s < v_min_min then
          v_s := v_s + v_slot_step;
          continue;
        end if;
        slot_date := v_day;
        slot_time := to_char(make_time(v_s / 60, v_s % 60, 0), 'HH24:MI');
        return next;
        v_s := v_s + v_slot_step;
      end loop;
    end loop;
  end loop;
end;
$$;

grant execute on function public.get_availability(uuid, uuid, date, int, int) to anon, authenticated;

-- ─── Клиент: запись и перенос ────────────────────────────────────────────
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
  where b.client_id = v_uid and b.master_id = p_master_id and b.starts_at = v_starts_at and b.status in ('pending', 'confirmed');
  if v_existing.id is not null then
    id := v_existing.id; starts_at := v_existing.starts_at; ends_at := v_existing.ends_at;
    price := v_existing.price; service_name := v_existing.service_name;
    return next;
    return;
  end if;

  if v_starts_at < now() + interval '1 hour' then
    raise exception 'Запись возможна не раньше чем через 1 час' using errcode = '22023';
  end if;
  perform public.assert_slot_bookable(p_master_id, p_service_id, v_starts_at, v_ends_at);

  select count(*) into v_active_count from public.bookings b
  where b.client_id = v_uid and b.business_id = p_business_id and b.status in ('pending', 'proposed', 'confirmed') and b.starts_at > now();
  if v_active_count >= 3 then
    raise exception 'У вас уже 3 активные записи в этом салоне — дождитесь визита или отмените одну' using errcode = 'P0001';
  end if;

  begin
    insert into public.bookings (
      client_id, client_name, client_phone, business_id, master_id, service_id, service_name, price,
      starts_at, ends_at, status, created_by, expires_at
    ) values (
      v_uid, v_client_name, v_client_phone, p_business_id, p_master_id, p_service_id, v_service.name, v_service.price,
      v_starts_at, v_ends_at, 'pending', 'client', public.request_deadline(2, v_starts_at)
    ) returning bookings.id into v_new_id;
  exception when exclusion_violation then
    raise exception 'Этот слот уже занят — обновите доступное время' using errcode = '23P01';
  end;

  id := v_new_id; starts_at := v_starts_at; ends_at := v_ends_at;
  price := v_service.price; service_name := v_service.name;
  return next;
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

  -- proposed: мастер уже предложил время — клиент отвечает на предложение
  -- (respond_to_proposal), а не переносит поверх него.
  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'Эту бронь уже нельзя перенести' using errcode = '22023';
  end if;

  -- Окно отмены защищает подтверждённое время мастера; неподтверждённую
  -- заявку клиент вправе двигать в любой момент.
  if v_booking.client_id = v_uid and v_booking.status = 'confirmed' then
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

  if v_booking.client_id = v_uid then
    if v_starts_at < now() + interval '1 hour' then
      raise exception 'Запись возможна не раньше чем через 1 час' using errcode = '22023';
    end if;
  end if;
  perform public.assert_slot_bookable(v_booking.master_id, v_booking.service_id, v_starts_at, v_ends_at, p_booking_id);

  begin
    -- Клиент перенёс — новое время снова должен принять мастер. Перенос
    -- со стороны салона статус не меняет: салон сам это время и выбрал.
    if v_booking.client_id = v_uid then
      update public.bookings
      set starts_at = v_starts_at, ends_at = v_ends_at, status = 'pending',
          expires_at = public.request_deadline(2, v_starts_at)
      where public.bookings.id = p_booking_id;
    else
      update public.bookings
      set starts_at = v_starts_at, ends_at = v_ends_at
      where public.bookings.id = p_booking_id;
    end if;
  exception when exclusion_violation then
    raise exception 'Этот слот уже занят — выберите другое время' using errcode = '23P01';
  end;

  id := p_booking_id; starts_at := v_starts_at; ends_at := v_ends_at;
  return next;
end;
$$;


-- ─── Салон: предложить другое время ──────────────────────────────────────
create or replace function public.propose_booking_time(p_booking_id uuid, p_date date, p_start text)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_start_min int;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration int;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  if p_start !~ '^([01]\d|2[0-3]):([0-5]\d)$' then
    raise exception 'Неверный формат времени' using errcode = '22023';
  end if;

  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Заявка не найдена' using errcode = 'P0002';
  end if;
  perform public.require_booking_staff(v_booking, v_uid);

  if v_booking.status <> 'pending' then
    raise exception 'Другое время можно предложить только на новую заявку' using errcode = '22023';
  end if;

  v_start_min := split_part(p_start, ':', 1)::int * 60 + split_part(p_start, ':', 2)::int;
  v_duration := extract(epoch from (v_booking.ends_at - v_booking.starts_at))::int / 60;
  v_starts_at := public.baku_local_to_utc(p_date, v_start_min);
  v_ends_at := v_starts_at + make_interval(mins => v_duration);

  if v_starts_at = v_booking.starts_at then
    raise exception 'Это то же самое время — просто примите заявку' using errcode = '22023';
  end if;

  if v_starts_at < now() + interval '1 hour' then
    raise exception 'Запись возможна не раньше чем через 1 час' using errcode = '22023';
  end if;
  perform public.assert_slot_bookable(v_booking.master_id, v_booking.service_id, v_starts_at, v_ends_at, p_booking_id);

  begin
    update public.bookings b
    set requested_starts_at = coalesce(b.requested_starts_at, b.starts_at),
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        status = 'proposed',
        expires_at = public.request_deadline(12, v_starts_at)
    where b.id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'Это время уже занято — выберите другое' using errcode = '23P01';
  end;

  id := p_booking_id; starts_at := v_starts_at; ends_at := v_ends_at;
  return next;
end;
$$;

