-- "Стать партнёром" — создаёт бизнес сразу активным (модерации в Фазе 0
-- нет по решению владельца) и переводит вызывающего в business_owner.
-- Одна plpgsql-функция = одна неявная транзакция, никакого ручного
-- runTransaction, как в Firebase-варианте.

create function public.create_business(
  p_name text,
  p_category_id text,
  p_city text,
  p_district text default null,
  p_address text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_business uuid;
  v_business_id uuid;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Некорректное название' using errcode = '22023';
  end if;
  if p_city is null or length(trim(p_city)) = 0 then
    raise exception 'Не указан город' using errcode = '22023';
  end if;

  select business_id into v_existing_business from public.profiles where id = v_uid;
  if v_existing_business is not null then
    raise exception 'У вас уже есть бизнес' using errcode = '23505';
  end if;

  insert into public.businesses (owner_id, name, category_id, city, district, address, phone)
  values (v_uid, trim(p_name), p_category_id, trim(p_city), p_district, p_address, p_phone)
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id) values (v_business_id, v_uid);

  perform set_config('bookspot.bypass_role_guard', 'on', true); -- true = только в этой транзакции
  update public.profiles set role = 'business_owner', business_id = v_business_id where id = v_uid;

  return v_business_id;
end;
$$;

revoke all on function public.create_business from public;
grant execute on function public.create_business to authenticated;
