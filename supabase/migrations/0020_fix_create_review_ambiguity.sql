-- Фикс: OUT-параметры create_review (id, rating, comment, created_at) из
-- returns table совпадали по имени с колонками bookings/reviews, из-за чего
-- "select * from bookings where id = p_booking_id" не мог разобрать,
-- колонка это или переменная функции ("column reference is ambiguous",
-- 42702) — тот же класс бага, что уже чинили в 0004/0006/0008. Разрешаем
-- явным псевдонимом таблицы в WHERE и прямой записью результата INSERT
-- сразу в OUT-параметры (тот же приём, что create_booking в 0004).
create or replace function public.create_review(p_booking_id uuid, p_rating smallint, p_comment text default null)
returns table (id uuid, rating smallint, comment text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_client_name text;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Оценка должна быть от 1 до 5' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if v_booking.id is null or v_booking.client_id is distinct from v_uid then
    raise exception 'Бронь не найдена' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'completed' then
    raise exception 'Отзыв можно оставить только после завершённого визита' using errcode = '22023';
  end if;

  select p.name into v_client_name from public.profiles p where p.id = v_uid;

  begin
    insert into public.reviews (booking_id, client_id, business_id, master_id, client_name, rating, comment)
    values (p_booking_id, v_uid, v_booking.business_id, v_booking.master_id, v_client_name, p_rating, p_comment)
    returning reviews.id, reviews.rating, reviews.comment, reviews.created_at into id, rating, comment, created_at;
  exception when unique_violation then
    raise exception 'Вы уже оставили отзыв на этот визит' using errcode = '23505';
  end;

  return next;
end;
$$;
