-- Самостоятельное удаление аккаунта (Apple Guideline 5.1.1(v) — обязательно
-- при наличии регистрации в приложении).
--
-- Клиент не может удалить свою же запись в auth.users напрямую (только
-- service_role умеет), поэтому нужна SECURITY DEFINER функция.
--
-- Брони не удаляются — они нужны бизнесу как история визитов и основа
-- будущей аналитики/отзывов. Вместо этого обезличиваются: client_id -> null
-- (как у брони "по звонку", FK profiles(id) без каскада иначе заблокировал
-- бы удаление auth.users), а денормализованные client_name/client_phone
-- (create_booking копирует их из profiles при создании брони — см. 0010)
-- переписываются, иначе настоящие имя и телефон остались бы в бизнес-базе
-- навсегда даже после "удаления" аккаунта.
--
-- masters.user_id — та же логика: FK на profiles(id) без каскада, задел под
-- будущую роль staff (сейчас нигде не заполняется, но на будущее не должен
-- блокировать удаление, если когда-то будет).
--
-- Владельца активного бизнеса удалить нельзя — иначе он осиротеет.
-- Отвязка бизнеса (admin_unlink_business, 0011) — отдельный, осознанный шаг
-- владельца, не часть автоматического удаления аккаунта.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_business_id uuid;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;

  select role, business_id into v_role, v_business_id from public.profiles where id = v_uid;

  if v_role = 'business_owner' and v_business_id is not null then
    raise exception 'Сначала отвяжите или передайте свой бизнес — аккаунт владельца активного салона нельзя удалить напрямую'
      using errcode = '23503';
  end if;

  update public.bookings
  set client_id = null,
      client_name = 'Удалённый пользователь',
      client_phone = null
  where client_id = v_uid;

  update public.masters
  set user_id = null
  where user_id = v_uid;

  -- favorites и business_members уходят каскадом вместе с profiles ниже
  -- (обе таблицы объявлены "on delete cascade" от profiles(id) в 0001).
  -- profiles сама уходит каскадом от auth.users — отдельный DELETE не нужен.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account from public;
grant execute on function public.delete_my_account to authenticated;
