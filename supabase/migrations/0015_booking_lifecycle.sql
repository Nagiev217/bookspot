-- Завершение визита — до сих пор недостижимая часть жизненного цикла брони.
-- completed/no_show уже есть в CHECK на bookings.status (0001_init.sql) и
-- уже рисуются в UI (bookings.jsx: statusLabel), но перейти в них было
-- неоткуда: bookings_no_direct_update запрещает любой UPDATE с клиента, а
-- RPC для перехода не было вообще — бронь физически нельзя было закрыть.
--
-- В отличие от cancel_booking/reschedule_booking (require_booking_access,
-- владелец брони ИЛИ бизнес) — здесь доступ только бизнесу: отметить визит
-- завершённым или неявкой — решение салона, не клиента.
create function public.complete_booking(p_booking_id uuid, p_status text)
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
  if p_status not in ('completed', 'no_show') then
    raise exception 'Недопустимый статус' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Бронь не найдена' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.business_members bm
    where bm.business_id = v_booking.business_id and bm.user_id = v_uid
  ) then
    raise exception 'Нет доступа к этой брони' using errcode = '42501';
  end if;

  -- Идемпотентность: повторный тап "Пришёл"/"Не пришёл" на медленной сети
  -- не должен падать ошибкой — если статус уже целевой, это не конфликт.
  if v_booking.status = p_status then
    return;
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'Эту бронь нельзя завершить — статус уже % ', v_booking.status using errcode = '22023';
  end if;
  if v_booking.starts_at > now() then
    raise exception 'Визит ещё не наступил' using errcode = '22023';
  end if;

  update public.bookings set status = p_status where id = p_booking_id;
end;
$$;

revoke all on function public.complete_booking from public;
grant execute on function public.complete_booking to authenticated;
