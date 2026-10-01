-- Запись по подтверждению мастера.
--
-- До этой миграции бронь клиента сразу становилась confirmed. Теперь это
-- заявка: status = 'pending', пока её не примет мастер (или владелец, если
-- у мастера нет своего логина — владелец может ответить за любого своего
-- мастера). Мастер может:
--   • принять           → confirmed  (accept_booking)
--   • отклонить         → cancelled, cancel_reason = 'declined'  (decline_booking)
--   • предложить другое время → proposed (propose_booking_time); клиент
--     принимает (→ confirmed) или отказывается (→ cancelled,
--     'proposal_declined') через respond_to_proposal.
-- Заявка без ответа 2 часа (или дольше, чем осталось до визита) отменяется
-- автоматически ('expired'); у предложения мастера на ответ клиента — 12 ч.
--
-- Пока заявка ждёт ответа, её время держится за клиентом: EXCLUDE и подсчёт
-- свободных слотов учитывают pending и proposed наравне с confirmed. При
-- предложении другого времени бронь переезжает на новое время сразу
-- (старое освобождается, новое держится до ответа клиента), исходное время
-- запоминается в requested_starts_at — для текста «вместо …».
--
-- Запись «по звонку» (create_manual_booking) по-прежнему сразу confirmed:
-- её создаёт сам салон.

-- ─── Статусы и поля ──────────────────────────────────────────────────────

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending', 'proposed', 'confirmed', 'cancelled', 'completed', 'no_show'));

alter table public.bookings
  add column expires_at timestamptz,
  add column requested_starts_at timestamptz,
  add column cancel_reason text check (cancel_reason in ('client', 'business', 'declined', 'expired', 'proposal_declined'));

alter table public.bookings drop constraint bookings_master_id_during_excl;
alter table public.bookings add constraint bookings_master_id_during_excl
  exclude using gist (master_id with =, during with &&)
  where (status in ('pending', 'proposed', 'confirmed'));

create index bookings_expiring_idx on public.bookings (expires_at) where status in ('pending', 'proposed');

alter table public.notification_outbox drop constraint notification_outbox_type_check;
alter table public.notification_outbox add constraint notification_outbox_type_check
  check (type in (
    'booking_confirmed', 'booking_reminder', 'booking_cancelled', 'new_booking_business',
    'booking_proposed', 'booking_declined', 'proposal_answered'
  ));

-- ─── Занятость: заявки держат время ──────────────────────────────────────
-- Тела — из 0016, изменён только фильтр статусов занятости.

create or replace function public.assert_slot_bookable(
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
    and status in ('pending', 'proposed', 'confirmed')
    and (starts_at at time zone 'Asia/Baku')::date = v_day
    and (p_exclude_booking_id is null or id <> p_exclude_booking_id);

  v_free := v_work - v_busy;

  if not (int4range(v_start_min, v_end_min) <@ v_free) then
    raise exception 'Этот мастер не работает в выбранное время' using errcode = '22023';
  end if;
end;
$$;


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
      and status in ('pending', 'proposed', 'confirmed')
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


-- ─── Клиент: заявка вместо подтверждённой записи ─────────────────────────
-- create_booking (0016): статус pending и срок ответа 2 ч; повтор той же
-- заявки возвращает её же; лимит «3 активные» считает и заявки.

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
      v_starts_at, v_ends_at, 'pending', 'client', least(now() + interval '2 hours', v_starts_at)
    ) returning bookings.id into v_new_id;
  exception when exclusion_violation then
    raise exception 'Этот слот уже занят — обновите доступное время' using errcode = '23P01';
  end;

  id := v_new_id; starts_at := v_starts_at; ends_at := v_ends_at;
  price := v_service.price; service_name := v_service.name;
  return next;
end;
$$;


-- reschedule_booking (0016): переносить можно и заявку; перенос клиентом
-- снова отправляет время мастеру на подтверждение.

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

  perform public.assert_slot_bookable(v_booking.master_id, v_booking.service_id, v_starts_at, v_ends_at, p_booking_id);

  begin
    -- Клиент перенёс — новое время снова должен принять мастер. Перенос
    -- со стороны салона статус не меняет: салон сам это время и выбрал.
    if v_booking.client_id = v_uid then
      update public.bookings
      set starts_at = v_starts_at, ends_at = v_ends_at, status = 'pending',
          expires_at = least(now() + interval '2 hours', v_starts_at)
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


-- cancel_booking (0010): отменить можно и заявку, и предложение; причина
-- отмены запоминается — от неё зависит, кому уйдёт push.

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

  if v_booking.status not in ('pending', 'proposed', 'confirmed') then
    raise exception 'Эту бронь уже нельзя отменить' using errcode = '22023';
  end if;

  -- Окно отмены — только для подтверждённой записи: от неподтверждённой
  -- заявки клиент может отказаться в любой момент.
  if v_booking.client_id = v_uid and v_booking.status = 'confirmed' then
    select biz.cancel_window_hours into v_cancel_window_hours from public.businesses biz where biz.id = v_booking.business_id;
    if now() > v_booking.starts_at - make_interval(hours => v_cancel_window_hours) then
      raise exception 'Отменить можно не позднее чем за % ч. до визита — позвоните в салон', v_cancel_window_hours using errcode = '22023';
    end if;
  end if;

  update public.bookings
  set status = 'cancelled',
      cancel_reason = case when v_booking.client_id = v_uid then 'client' else 'business' end
  where id = p_booking_id;
end;
$$;


-- ─── Ответ салона на заявку ──────────────────────────────────────────────

-- Владелец салона или мастер этой брони со своим логином. Клиенту — нет,
-- даже если он сам сотрудник другого салона.
create function public.require_booking_staff(p_booking public.bookings, p_uid uuid)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if exists (select 1 from public.businesses b where b.id = p_booking.business_id and b.owner_id = p_uid) then
    return;
  end if;
  if exists (select 1 from public.masters m where m.id = p_booking.master_id and m.user_id = p_uid) then
    return;
  end if;
  raise exception 'Ответить на заявку может только мастер или владелец салона' using errcode = '42501';
end;
$$;

create function public.accept_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Заявка не найдена' using errcode = 'P0002';
  end if;
  perform public.require_booking_staff(v_booking, v_uid);

  if v_booking.status = 'confirmed' then
    return; -- повторное нажатие
  end if;
  if v_booking.status = 'proposed' then
    raise exception 'Вы уже предложили другое время — ждём ответа клиента' using errcode = '22023';
  end if;
  if v_booking.status <> 'pending' then
    raise exception 'Заявка уже закрыта' using errcode = '22023';
  end if;
  if v_booking.starts_at <= now() then
    raise exception 'Время заявки уже прошло' using errcode = '22023';
  end if;

  update public.bookings set status = 'confirmed', expires_at = null where id = p_booking_id;
end;
$$;

create function public.decline_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Заявка не найдена' using errcode = 'P0002';
  end if;
  perform public.require_booking_staff(v_booking, v_uid);

  -- proposed тоже можно отозвать: мастер передумал и не готов ни к какому времени.
  if v_booking.status not in ('pending', 'proposed') then
    raise exception 'Заявка уже закрыта' using errcode = '22023';
  end if;

  update public.bookings set status = 'cancelled', cancel_reason = 'declined', expires_at = null where id = p_booking_id;
end;
$$;

-- Мастер не может в это время — предлагает своё. Новое время проверяется
-- так же строго, как запись клиента (assert_slot_bookable), и сразу
-- держится за клиентом; исходное освобождается.
create function public.propose_booking_time(p_booking_id uuid, p_date date, p_start text)
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

  perform public.assert_slot_bookable(v_booking.master_id, v_booking.service_id, v_starts_at, v_ends_at, p_booking_id);

  begin
    update public.bookings b
    set requested_starts_at = coalesce(b.requested_starts_at, b.starts_at),
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        status = 'proposed',
        expires_at = least(now() + interval '12 hours', v_starts_at)
    where b.id = p_booking_id;
  exception when exclusion_violation then
    raise exception 'Это время уже занято — выберите другое' using errcode = '23P01';
  end;

  id := p_booking_id; starts_at := v_starts_at; ends_at := v_ends_at;
  return next;
end;
$$;

-- Ответ клиента на предложенное мастером время.
create function public.respond_to_proposal(p_booking_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Запись не найдена' using errcode = 'P0002';
  end if;
  if v_booking.client_id is distinct from v_uid then
    raise exception 'Нет доступа к этой записи' using errcode = '42501';
  end if;
  if v_booking.status <> 'proposed' then
    raise exception 'Предложение уже неактуально' using errcode = '22023';
  end if;

  if p_accept then
    if v_booking.starts_at <= now() then
      raise exception 'Предложенное время уже прошло' using errcode = '22023';
    end if;
    update public.bookings set status = 'confirmed', expires_at = null where id = p_booking_id;
  else
    update public.bookings set status = 'cancelled', cancel_reason = 'proposal_declined', expires_at = null where id = p_booking_id;
  end if;
end;
$$;

-- Просроченные заявки и предложения — раз в минуту из pg_cron.
create function public.expire_booking_requests()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.bookings
  set status = 'cancelled', cancel_reason = 'expired'
  where status in ('pending', 'proposed') and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.require_booking_staff from public;
revoke all on function public.accept_booking from public;
revoke all on function public.decline_booking from public;
revoke all on function public.propose_booking_time from public;
revoke all on function public.respond_to_proposal from public;
revoke all on function public.expire_booking_requests from public;
grant execute on function public.accept_booking to authenticated;
grant execute on function public.decline_booking to authenticated;
grant execute on function public.propose_booking_time to authenticated;
grant execute on function public.respond_to_proposal to authenticated;
-- cron работает от владельца функции; service_role — для проверочного скрипта.
grant execute on function public.expire_booking_requests to service_role;

select cron.schedule('expire-booking-requests', '* * * * *', $cron$ select public.expire_booking_requests(); $cron$);

-- ─── Уведомления ─────────────────────────────────────────────────────────
-- Переписано целиком (0022): у заявки больше переходов, и у каждого свой
-- адресат. «Салон» = владелец + мастер этой брони, если у него есть логин.
-- Попутно исправлено: напоминание не переезжало при переносе записи и
-- уходило даже на неподтверждённую; при отмене клиентом push получал сам
-- клиент, а салон — нет.
create or replace function public.enqueue_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_when text := to_char(new.starts_at at time zone 'Asia/Baku', 'DD.MM HH24:MI');
  v_old_when text;
  v_client text := coalesce(new.client_name, 'Клиент');
  v_staff_title text;
  v_staff_body text;
  v_client_type text;
  v_client_title text;
  v_client_body text;
begin
  if TG_OP = 'INSERT' then
    if new.status = 'pending' then
      v_staff_title := 'Новая заявка';
      v_staff_body := v_client || ' — ' || new.service_name || ', ' || v_when || '. Подтвердите в течение 2 часов';
    else
      v_staff_title := 'Новая запись';
      v_staff_body := v_client || ' — ' || new.service_name || ', ' || v_when;
      if new.client_id is not null then
        v_client_type := 'booking_confirmed';
        v_client_title := 'Запись подтверждена';
        v_client_body := new.service_name || ' — ' || v_when;
      end if;
    end if;

  elsif TG_OP = 'UPDATE' then
    v_old_when := to_char(old.starts_at at time zone 'Asia/Baku', 'DD.MM HH24:MI');

    -- Напоминание всегда соответствует текущему времени подтверждённой записи.
    if new.status is distinct from old.status or new.starts_at is distinct from old.starts_at then
      delete from public.notification_outbox
      where booking_id = new.id and type = 'booking_reminder' and sent_at is null;
      if new.status = 'confirmed' and new.client_id is not null then
        insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
        values (
          new.client_id, new.id, 'booking_reminder', 'Напоминание о записи',
          new.service_name || ' сегодня в ' || to_char(new.starts_at at time zone 'Asia/Baku', 'HH24:MI'),
          new.starts_at - interval '2 hours'
        );
      end if;
    end if;

    if old.status = 'pending' and new.status = 'confirmed' then
      v_client_type := 'booking_confirmed';
      v_client_title := 'Запись подтверждена';
      v_client_body := new.service_name || ' — ' || v_when;

    elsif old.status = 'pending' and new.status = 'proposed' then
      v_client_type := 'booking_proposed';
      v_client_title := 'Мастер предложил другое время';
      v_client_body := new.service_name || ' — ' || v_when || ' вместо ' || v_old_when || '. Примите или откажитесь';

    elsif old.status = 'proposed' and new.status = 'confirmed' then
      v_staff_title := 'Клиент принял ваше время';
      v_staff_body := v_client || ' — ' || new.service_name || ', ' || v_when;

    elsif new.status = 'cancelled' and old.status in ('pending', 'proposed', 'confirmed') then
      case new.cancel_reason
        when 'declined' then
          v_client_type := 'booking_declined';
          v_client_title := 'Мастер не сможет принять';
          v_client_body := new.service_name || ' — ' || v_when || '. Выберите другое время';
        when 'expired' then
          if old.status = 'pending' then
            v_client_type := 'booking_declined';
            v_client_title := 'Заявка не подтверждена';
            v_client_body := 'Салон не ответил вовремя: ' || new.service_name || ' — ' || v_when || '. Попробуйте другое время';
          else
            v_staff_title := 'Клиент не ответил на ваше время';
            v_staff_body := v_client || ' — ' || new.service_name || ', ' || v_when || '. Время освобождено';
          end if;
        when 'proposal_declined' then
          v_staff_title := 'Клиент отказался от времени';
          v_staff_body := v_client || ' — ' || new.service_name || ', ' || v_when || '. Время освобождено';
        when 'client' then
          v_staff_title := 'Клиент отменил запись';
          v_staff_body := v_client || ' — ' || new.service_name || ', ' || v_when;
        else
          v_client_type := 'booking_cancelled';
          v_client_title := 'Запись отменена';
          v_client_body := new.service_name || ' — ' || v_when;
      end case;

    elsif old.status in ('pending', 'confirmed') and new.status = 'pending' and new.starts_at is distinct from old.starts_at then
      v_staff_title := 'Клиент перенёс запись';
      v_staff_body := v_client || ' — ' || new.service_name || ', ' || v_when || ' вместо ' || v_old_when || '. Подтвердите новое время';
    end if;
  end if;

  if v_client_type is not null and new.client_id is not null then
    insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
    values (new.client_id, new.id, v_client_type, v_client_title, v_client_body, now());
  end if;

  if v_staff_title is not null then
    insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
    select r.uid, new.id,
      case
        when TG_OP = 'INSERT' or new.status = 'pending' then 'new_booking_business'
        when new.status = 'cancelled' and new.cancel_reason = 'client' then 'booking_cancelled'
        else 'proposal_answered'
      end,
      v_staff_title, v_staff_body, now()
    from (
      select b.owner_id as uid from public.businesses b where b.id = new.business_id
      union
      select m.user_id from public.masters m where m.id = new.master_id and m.user_id is not null
    ) r;
  end if;

  -- Напоминание на запись «по звонку» / сразу подтверждённую.
  if TG_OP = 'INSERT' and new.status = 'confirmed' and new.client_id is not null then
    insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
    values (
      new.client_id, new.id, 'booking_reminder', 'Напоминание о записи',
      new.service_name || ' сегодня в ' || to_char(new.starts_at at time zone 'Asia/Baku', 'HH24:MI'),
      new.starts_at - interval '2 hours'
    );
  end if;

  return new;
end;
$$;
