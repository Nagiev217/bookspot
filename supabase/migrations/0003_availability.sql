-- Реальная генерация слотов и создание брони. Алгоритм — тот же, что уже
-- проверен в shared/slots.js (рабочие часы минус исключения минус занятые
-- интервалы, нарезка по длительности услуги + буфер), но переписан на
-- нативные multirange-типы Postgres 17: диапазон "-" диапазон = разность
-- множеств одной операцией, без ручного цикла вычитания интервалов.
--
-- Часовой пояс: Азербайджан — UTC+4 без перехода на летнее время, поэтому
-- 'Asia/Baku' в Postgres tzdata даёт корректную конвертацию без сюрпризов.
-- (Клиентский JS в shared/time.js делает то же самое вручную — там нет
-- доступа к базе IANA-таймзон в React Native, здесь она есть нативно.)

create function public.baku_local_to_utc(p_date date, p_minutes int)
returns timestamptz
language sql
immutable
as $$
  select (p_date::timestamp + make_interval(mins => p_minutes)) at time zone 'Asia/Baku';
$$;

-- Возвращает свободные слоты (по местному времени Баку) для (мастер,
-- услуга) на диапазоне дат [p_from, p_from + p_days). slot_time — уже
-- отформатированная строка "HH:MM", чтобы клиенту не нужно было ничего
-- конвертировать.
create function public.get_availability(
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

    -- Занятые интервалы этого дня — из уже подтверждённых броней,
    -- переведённые в местные минуты и расширенные на буфер бизнеса.
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

revoke all on function public.get_availability from public;
grant execute on function public.get_availability to authenticated;

-- Создаёт бронь и полагается на EXCLUDE-constraint bookings (0001_init.sql)
-- как на единственную защиту от двойного бронирования — никакого ручного
-- документа-замка/транзакции с повторной проверкой, как потребовалось бы
-- на Firestore. Идемпотентность на повторную отправку одного и того же
-- запроса реализована проверкой "может, это уже моя бронь" перед INSERT,
-- а не отдельным ключом — для простого MVP-потока этого достаточно.
create function public.create_booking(
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

  select business_id into v_master_business from public.masters where id = p_master_id;
  if v_master_business is null or v_master_business <> p_business_id then
    raise exception 'Мастер не найден в этом бизнесе' using errcode = 'P0002';
  end if;

  select id, name, price, duration_min into v_service
  from public.services where id = p_service_id and business_id = p_business_id and active;
  if v_service.id is null then
    raise exception 'Услуга не найдена в этом бизнесе' using errcode = 'P0002';
  end if;

  v_starts_at := public.baku_local_to_utc(p_date, v_start_min);
  v_ends_at := v_starts_at + make_interval(mins => v_service.duration_min);

  -- Повторная отправка того же запроса (плохая связь и т.п.) — вернуть
  -- уже созданную бронь вместо падения на EXCLUDE-constraint.
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
      client_id, business_id, master_id, service_id, service_name, price,
      starts_at, ends_at, status, created_by
    ) values (
      v_uid, p_business_id, p_master_id, p_service_id, v_service.name, v_service.price,
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

revoke all on function public.create_booking from public;
grant execute on function public.create_booking to authenticated;
