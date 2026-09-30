-- Платформенный admin, аккаунты мастеров и подписка салона.
--
-- Модель: салон становится партнёром через WhatsApp и платит подписку. Салон
-- и аккаунт владельца создаёт только admin (Edge Function manage-accounts,
-- там же — auth.admin.createUser, для которого нужен service_role). Владелец
-- выдаёт логины своим мастерам; мастер видит только своё расписание.
--
-- До этой миграции в базе не было разницы между владельцем и сотрудником:
-- любая строка business_members могла менять салон, услуги, мастеров,
-- расписания и фото и видела все брони салона. Здесь запись закрывается
-- владельцу (businesses.owner_id), а брони мастеру видны только свои.

-- ─── Колонки ─────────────────────────────────────────────────────────────

alter table public.profiles add column must_change_password boolean not null default false;

alter table public.business_members add column role text not null default 'staff' check (role in ('owner', 'staff'));
update public.business_members bm set role = 'owner'
from public.businesses b
where b.id = bm.business_id and b.owner_id = bm.user_id;

-- null = салон без учёта подписки (созданные до этой миграции — демо и
-- Atelier Nizami — не пропадают из каталога). Новые салоны admin создаёт
-- сразу с датой.
alter table public.businesses add column paid_until date;

-- ─── Хелперы (SECURITY DEFINER — читают таблицы в обход RLS, как
--     is_business_member в 0001) ──────────────────────────────────────────

create function public.is_platform_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.is_business_owner(target_business_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.businesses where id = target_business_id and owner_id = auth.uid());
$$;

-- id мастера, под которым вошёл текущий пользователь-сотрудник этого салона.
create function public.staff_master_id(target_business_id uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select m.id from public.masters m
  where m.business_id = target_business_id and m.user_id = auth.uid()
  limit 1;
$$;

create function public.business_is_bookable(target_business_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.businesses b
    where b.id = target_business_id
      and b.status = 'active'
      and (b.paid_until is null or b.paid_until >= (now() at time zone 'Asia/Baku')::date)
  );
$$;

-- ─── Видимость ───────────────────────────────────────────────────────────

-- Каталог: активный салон с неистёкшей подпиской. Владелец и мастера видят
-- свой салон всегда (чтобы увидеть, что подписка кончилась), admin — все.
drop policy "businesses_public_read_active" on public.businesses;
create policy "businesses_public_read_active" on public.businesses
  for select using (
    (status = 'active' and (paid_until is null or paid_until >= (now() at time zone 'Asia/Baku')::date))
    or public.is_business_member(id)
    or public.is_platform_admin()
  );

-- Брони: клиент — свои, владелец — все брони салона, мастер — только брони
-- своего мастера, admin — все (поддержка).
drop policy "bookings_read_own_or_business" on public.bookings;
create policy "bookings_read_own_or_business" on public.bookings
  for select using (
    auth.uid() = client_id
    or public.is_business_owner(business_id)
    or master_id = public.staff_master_id(business_id)
    or public.is_platform_admin()
  );

create policy "profiles_admin_read" on public.profiles
  for select using (public.is_platform_admin());

-- ─── Запись — только владелец салона ─────────────────────────────────────

drop policy "businesses_member_write" on public.businesses;
create policy "businesses_owner_write" on public.businesses
  for update using (public.is_business_owner(id)) with check (public.is_business_owner(id));

drop policy "services_member_write" on public.services;
create policy "services_owner_write" on public.services
  for all using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy "masters_member_write" on public.masters;
create policy "masters_owner_write" on public.masters
  for all using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

drop policy "service_masters_member_write" on public.service_masters;
create policy "service_masters_owner_write" on public.service_masters
  for all using (
    exists (select 1 from public.services s where s.id = service_id and public.is_business_owner(s.business_id))
  ) with check (
    exists (select 1 from public.services s where s.id = service_id and public.is_business_owner(s.business_id))
  );

drop policy "master_schedule_member_write" on public.master_schedule;
create policy "master_schedule_owner_write" on public.master_schedule
  for all using (
    exists (select 1 from public.masters m where m.id = master_id and public.is_business_owner(m.business_id))
  ) with check (
    exists (select 1 from public.masters m where m.id = master_id and public.is_business_owner(m.business_id))
  );

drop policy "master_exceptions_member_write" on public.master_exceptions;
create policy "master_exceptions_owner_write" on public.master_exceptions
  for all using (
    exists (select 1 from public.masters m where m.id = master_id and public.is_business_owner(m.business_id))
  ) with check (
    exists (select 1 from public.masters m where m.id = master_id and public.is_business_owner(m.business_id))
  );

drop policy "master_exception_intervals_member_write" on public.master_exception_intervals;
create policy "master_exception_intervals_owner_write" on public.master_exception_intervals
  for all using (
    exists (
      select 1 from public.master_exceptions e
      join public.masters m on m.id = e.master_id
      where e.id = exception_id and public.is_business_owner(m.business_id)
    )
  ) with check (
    exists (
      select 1 from public.master_exceptions e
      join public.masters m on m.id = e.master_id
      where e.id = exception_id and public.is_business_owner(m.business_id)
    )
  );

drop policy "photos_business_write" on storage.objects;
create policy "photos_business_write" on storage.objects
  for all using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'business'
    and public.is_business_owner(((storage.foldername(name))[2])::uuid)
  ) with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'business'
    and public.is_business_owner(((storage.foldername(name))[2])::uuid)
  );

drop policy "photos_master_write" on storage.objects;
create policy "photos_master_write" on storage.objects
  for all using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'master'
    and exists (
      select 1 from public.masters m
      where m.id = ((storage.foldername(name))[2])::uuid and public.is_business_owner(m.business_id)
    )
  ) with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'master'
    and exists (
      select 1 from public.masters m
      where m.id = ((storage.foldername(name))[2])::uuid and public.is_business_owner(m.business_id)
    )
  );

-- ─── Защита полей: подписку и статус меняет только admin ─────────────────

create or replace function public.prevent_business_self_escalation()
returns trigger language plpgsql as $$
begin
  if current_setting('bookspot.bypass_role_guard', true) = 'on' then
    return new;
  end if;
  if new.status <> old.status or new.owner_id <> old.owner_id or new.paid_until is distinct from old.paid_until then
    raise exception 'status, owner_id и paid_until нельзя менять напрямую';
  end if;
  return new;
end;
$$;

-- ─── Новые брони — только у салона с активной подпиской ──────────────────
-- Триггер, а не проверка в каждом RPC: закрывает и create_booking, и
-- create_manual_booking разом. Уже созданные брони (UPDATE) не трогает.
create function public.require_bookable_business()
returns trigger language plpgsql as $$
begin
  if not public.business_is_bookable(new.business_id) then
    raise exception 'Салон временно не принимает записи' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger bookings_require_bookable_business
  before insert on public.bookings
  for each row execute function public.require_bookable_business();

-- ─── Доступ к брони: клиент, владелец или мастер этой брони ─────────────

create or replace function public.require_booking_access(p_booking record, p_uid uuid)
returns void
language plpgsql
as $$
begin
  if p_booking.client_id = p_uid then
    return;
  end if;
  if exists (select 1 from public.businesses b where b.id = p_booking.business_id and b.owner_id = p_uid) then
    return;
  end if;
  if exists (select 1 from public.masters m where m.id = p_booking.master_id and m.user_id = p_uid) then
    return;
  end if;
  raise exception 'Нет доступа к этой брони' using errcode = '42501';
end;
$$;

-- complete_booking (0015): владелец или мастер этой брони.
create or replace function public.complete_booking(p_booking_id uuid, p_status text)
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

  select b.* into v_booking from public.bookings b where b.id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Бронь не найдена' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.businesses b where b.id = v_booking.business_id and b.owner_id = v_uid)
     and not exists (select 1 from public.masters m where m.id = v_booking.master_id and m.user_id = v_uid) then
    raise exception 'Нет доступа к этой брони' using errcode = '42501';
  end if;

  if v_booking.status = p_status then
    return;
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Эту бронь нельзя завершить — статус уже % ', v_booking.status using errcode = '22023';
  end if;
  if v_booking.starts_at > now() then
    raise exception 'Визит ещё не наступил' using errcode = '22023';
  end if;

  update public.bookings set status = p_status where public.bookings.id = p_booking_id;
end;
$$;

-- create_manual_booking (0016): владелец — к любому мастеру салона, мастер —
-- только к себе. Остальное без изменений.
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
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)
     and not exists (select 1 from public.masters m where m.id = p_master_id and m.business_id = p_business_id and m.user_id = v_uid) then
    raise exception 'Нет доступа к записи к этому мастеру' using errcode = '42501';
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

-- enqueue_booking_notifications (0018): «Новая запись» — владельцу и мастеру
-- этой брони, а не всем участникам салона.
create or replace function public.enqueue_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_when text;
begin
  v_when := to_char(new.starts_at at time zone 'Asia/Baku', 'DD.MM HH24:MI');

  if TG_OP = 'INSERT' then
    if new.client_id is not null then
      insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
      values (new.client_id, new.id, 'booking_confirmed', 'Запись подтверждена', new.service_name || ' — ' || v_when, now());
      insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
      values (
        new.client_id, new.id, 'booking_reminder', 'Напоминание о записи',
        new.service_name || ' сегодня в ' || to_char(new.starts_at at time zone 'Asia/Baku', 'HH24:MI'),
        new.starts_at - interval '2 hours'
      );
    end if;

    insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
    select r.uid, new.id, 'new_booking_business', 'Новая запись',
      coalesce(new.client_name, 'Клиент') || ' — ' || new.service_name || ', ' || v_when,
      now()
    from (
      select b.owner_id as uid from public.businesses b where b.id = new.business_id
      union
      select m.user_id from public.masters m where m.id = new.master_id and m.user_id is not null
    ) r;

  elsif TG_OP = 'UPDATE' and new.status = 'cancelled' and old.status = 'confirmed' then
    delete from public.notification_outbox
    where booking_id = new.id and type = 'booking_reminder' and sent_at is null;

    if new.client_id is not null then
      insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
      values (new.client_id, new.id, 'booking_cancelled', 'Запись отменена', new.service_name || ' — ' || v_when, now());
    end if;
  end if;

  return new;
end;
$$;

-- ─── Admin: создание салона с владельцем (вызывает только manage-accounts) ─

create function public.admin_create_business(
  p_owner_id uuid,
  p_name text,
  p_category_id text,
  p_city text,
  p_district text,
  p_address text,
  p_phone text,
  p_paid_until date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Некорректное название' using errcode = '22023';
  end if;
  if p_city is null or length(trim(p_city)) = 0 then
    raise exception 'Не указан город' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = p_owner_id and business_id is not null) then
    raise exception 'У этого пользователя уже есть бизнес' using errcode = '23505';
  end if;

  insert into public.businesses (owner_id, name, category_id, city, district, address, phone, paid_until)
  values (p_owner_id, trim(p_name), p_category_id, trim(p_city), p_district, p_address, p_phone, p_paid_until)
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role) values (v_business_id, p_owner_id, 'owner');

  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.profiles
  set role = 'business_owner', business_id = v_business_id, must_change_password = true
  where id = p_owner_id;

  return v_business_id;
end;
$$;

revoke all on function public.admin_create_business from public;
grant execute on function public.admin_create_business to service_role;

-- Владелец выдаёт мастеру логин (вызывает только manage-accounts после
-- проверки, что вызывающий — владелец этого салона).
create function public.link_staff(p_business_id uuid, p_user_id uuid, p_master_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.masters m where m.id = p_master_id and m.business_id = p_business_id) then
    raise exception 'Мастер не найден в этом бизнесе' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.masters m where m.id = p_master_id and m.user_id is not null) then
    raise exception 'У этого мастера уже есть доступ' using errcode = '23505';
  end if;

  insert into public.business_members (business_id, user_id, role) values (p_business_id, p_user_id, 'staff');
  update public.masters set user_id = p_user_id where id = p_master_id;

  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.profiles
  set role = 'staff', business_id = p_business_id, must_change_password = true
  where id = p_user_id;
end;
$$;

revoke all on function public.link_staff from public;
grant execute on function public.link_staff to service_role;

-- ─── Admin: подписка, блокировка, список салонов ─────────────────────────

create function public.admin_set_subscription(p_business_id uuid, p_paid_until date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Только для администратора' using errcode = '42501';
  end if;
  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.businesses set paid_until = p_paid_until where id = p_business_id;
  if not found then
    raise exception 'Салон не найден' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_subscription from public;
grant execute on function public.admin_set_subscription to authenticated;

create function public.admin_set_business_status(p_business_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Только для администратора' using errcode = '42501';
  end if;
  if p_status not in ('active', 'blocked') then
    raise exception 'Недопустимый статус' using errcode = '22023';
  end if;
  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.businesses set status = p_status where id = p_business_id;
  if not found then
    raise exception 'Салон не найден' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_business_status from public;
grant execute on function public.admin_set_business_status to authenticated;

create function public.admin_list_businesses()
returns table (
  id uuid, name text, category_id text, city text, district text, phone text,
  status text, paid_until date, created_at timestamptz,
  owner_id uuid, owner_name text, owner_email text, owner_phone text,
  upcoming_bookings int
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Только для администратора' using errcode = '42501';
  end if;
  return query
  select b.id, b.name, b.category_id, b.city, b.district, b.phone,
         b.status, b.paid_until, b.created_at,
         b.owner_id, p.name, u.email::text, p.phone,
         (select count(*)::int from public.bookings bk
          where bk.business_id = b.id and bk.status = 'confirmed' and bk.starts_at > now())
  from public.businesses b
  left join public.profiles p on p.id = b.owner_id
  left join auth.users u on u.id = b.owner_id
  order by b.created_at desc;
end;
$$;

revoke all on function public.admin_list_businesses from public;
grant execute on function public.admin_list_businesses to authenticated;

-- Назначить/снять роль admin (scripts/make-admin.js). Только service_role —
-- из приложения стать admin'ом нельзя никак.
create function public.set_platform_admin(p_user_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.profiles
  set role = case when p_on then 'admin'::public.user_role else 'client'::public.user_role end
  where id = p_user_id and (p_on or role = 'admin');
  if not found then
    raise exception 'Профиль не найден или это не admin' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_platform_admin from public;
grant execute on function public.set_platform_admin to service_role;

-- ─── Первый вход по временному паролю ────────────────────────────────────

create function public.clear_must_change_password()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

revoke all on function public.clear_must_change_password from public;
grant execute on function public.clear_must_change_password to authenticated;

-- ─── Самостоятельная регистрация салона закрыта ──────────────────────────
-- Партнёры приходят через WhatsApp, салон создаёт admin.
revoke execute on function public.create_business from authenticated;
