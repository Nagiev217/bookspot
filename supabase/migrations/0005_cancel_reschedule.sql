-- Отмена и перенос брони. Прямая запись в bookings с клиента запрещена
-- правилами (0001_init.sql: "bookings_no_direct_update" — using (false)),
-- поэтому оба действия идут через SECURITY DEFINER функции, как и
-- create_booking. Право действия — владелец брони (клиент) или участник
-- бизнеса (business_members), проверяется явно, а не через RLS.

create function public.require_booking_access(p_booking record, p_uid uuid)
returns void
language plpgsql
as $$
begin
  if p_booking.client_id = p_uid then
    return;
  end if;
  if exists (select 1 from public.business_members bm where bm.business_id = p_booking.business_id and bm.user_id = p_uid) then
    return;
  end if;
  raise exception 'Нет доступа к этой брони' using errcode = '42501';
end;
$$;

create function public.cancel_booking(p_booking_id uuid)
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

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Бронь не найдена' using errcode = 'P0002';
  end if;

  perform public.require_booking_access(v_booking, v_uid);

  if v_booking.status <> 'confirmed' then
    raise exception 'Эту бронь уже нельзя отменить' using errcode = '22023';
  end if;

  -- Статус меняется, а не строка удаляется — EXCLUDE-constraint на
  -- bookings действует только для status='confirmed' (0001_init.sql),
  -- поэтому отменённая бронь сама освобождает слот без побочной логики.
  update public.bookings set status = 'cancelled' where id = p_booking_id;
end;
$$;

revoke all on function public.cancel_booking from public;
grant execute on function public.cancel_booking to authenticated;

create function public.reschedule_booking(p_booking_id uuid, p_date date, p_start text)
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
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  if p_start !~ '^([01]\d|2[0-3]):([0-5]\d)$' then
    raise exception 'Неверный формат времени' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Бронь не найдена' using errcode = 'P0002';
  end if;

  perform public.require_booking_access(v_booking, v_uid);

  if v_booking.status <> 'confirmed' then
    raise exception 'Эту бронь уже нельзя перенести' using errcode = '22023';
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

revoke all on function public.reschedule_booking from public;
grant execute on function public.reschedule_booking to authenticated;
