-- Дыры из аудита безопасности (Trail of Bits audit-context-building,
-- audit-context/DOSSIER.md), подтверждённые вживую на рабочей базе.
--
-- 1. Владелец мог напрямую (PATCH /masters) записать в masters.user_id любой
--    чужой uid — в обход выдачи доступа через manage-accounts. Этот аккаунт
--    сразу получал права мастера: принимать/отклонять заявки, менять фото и
--    «о себе» мастера. masters_owner_write — FOR ALL без ограничения колонок.
-- 2. Владелец мог вписать себе любой рейтинг (rating_avg/review_count не
--    входили в защищённые поля). Попутно: recompute_business_rating не был
--    SECURITY DEFINER, поэтому при правке или удалении отзыва автором
--    пересчёт молча не срабатывал (RLS отфильтровывал UPDATE businesses).
-- 3. Аноним видел client_id каждого отзыва — по нему можно было связать
--    отзывы одного человека в разных салонах.
-- 4. Флаг «смените временный пароль» пользователь снимал сам прямым UPDATE
--    или RPC, не меняя пароль; временный пароль из WhatsApp оставался рабочим.
-- 5. Настройки салона без ограничений: slot_step_min <= 0 зацикливал
--    get_availability.

-- ─── 1. Привязка логина к мастеру ────────────────────────────────────────

create function public.guard_master_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- link_staff (через GUC) и manage-accounts (service_role) — штатные пути.
  if current_setting('bookspot.bypass_role_guard', true) = 'on' or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if TG_OP = 'INSERT' then
    if new.user_id is not null then
      raise exception 'Доступ мастеру выдаётся только через «Команда → Выдать доступ»' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.user_id is distinct from old.user_id then
    -- Единственное, что можно без сервера: мастер отвязывает сам себя
    -- (удаление своего аккаунта, delete_my_account).
    if not (new.user_id is null and old.user_id = auth.uid()) then
      raise exception 'Доступ мастеру выдаётся только через «Команда → Выдать доступ»' using errcode = '42501';
    end if;
  end if;
  -- Записи мастера ссылаются на его салон; перенос в другой салон развёл бы их.
  if new.business_id <> old.business_id then
    raise exception 'Мастера нельзя перенести в другой салон' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger masters_guard_identity
  before insert or update on public.masters
  for each row execute function public.guard_master_identity();

-- Один логин — один мастер (staff_master_id и update_my_master_profile
-- берут «первого попавшегося» мастера пользователя).
create unique index masters_user_id_unique on public.masters (user_id) where user_id is not null;

-- ─── 2. Рейтинг салона ───────────────────────────────────────────────────

create or replace function public.prevent_business_self_escalation()
returns trigger language plpgsql as $$
begin
  if current_setting('bookspot.bypass_role_guard', true) = 'on' then
    return new;
  end if;
  if new.status <> old.status or new.owner_id <> old.owner_id or new.paid_until is distinct from old.paid_until then
    raise exception 'status, owner_id и paid_until нельзя менять напрямую';
  end if;
  if new.published_at is distinct from old.published_at and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'published_at нельзя менять напрямую — используйте publish_business';
  end if;
  -- Рейтинг — только пересчёт по отзывам (recompute_business_rating).
  if (new.rating_avg is distinct from old.rating_avg or new.review_count is distinct from old.review_count)
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Рейтинг считается по отзывам, менять его напрямую нельзя' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.recompute_business_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := coalesce(new.business_id, old.business_id);
  v_prev text := coalesce(current_setting('bookspot.bypass_role_guard', true), '');
begin
  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.businesses b
  set rating_avg = sub.avg_rating, review_count = sub.cnt
  from (
    select avg(rating)::numeric(2,1) as avg_rating, count(*) as cnt
    from public.reviews where business_id = v_business_id
  ) sub
  where b.id = v_business_id;
  perform set_config('bookspot.bypass_role_guard', v_prev, true);
  return null;
end;
$$;
revoke execute on function public.recompute_business_rating() from public, anon, authenticated;

-- Пересчитать то, что уже могло разойтись (накрутка или пропущенные пересчёты).
select set_config('bookspot.bypass_role_guard', 'on', true);
update public.businesses b
set rating_avg = sub.avg_rating, review_count = coalesce(sub.cnt, 0)
from (
  select bb.id, (select avg(r.rating)::numeric(2,1) from public.reviews r where r.business_id = bb.id) avg_rating,
         (select count(*) from public.reviews r where r.business_id = bb.id) cnt
  from public.businesses bb
) sub
where b.id = sub.id;
select set_config('bookspot.bypass_role_guard', 'off', true);

-- ─── 3. client_id отзывов ────────────────────────────────────────────────
-- Все колонки, кроме client_id. RLS-политики (client_id = auth.uid()) и
-- триггеры колонку по-прежнему видят — право на SELECT им не нужно.

revoke select on public.reviews from anon, authenticated;
grant select (id, booking_id, business_id, master_id, client_name, rating, comment, created_at, updated_at)
  on public.reviews to anon, authenticated;

-- ─── 4. Временный пароль ─────────────────────────────────────────────────
-- Отпечаток (bcrypt-хэш) выданного временного пароля. Схема private не
-- открыта PostgREST, у anon/authenticated прав нет.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.temp_passwords (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_hash text not null,
  issued_at timestamptz not null default now()
);

-- Вызывает manage-accounts сразу после выдачи временного пароля.
create function public.mark_temp_password(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into private.temp_passwords (user_id, password_hash)
  select u.id, u.encrypted_password from auth.users u where u.id = p_user_id
  on conflict (user_id) do update set password_hash = excluded.password_hash, issued_at = now();
end;
$$;
revoke execute on function public.mark_temp_password(uuid) from public, anon, authenticated;
grant execute on function public.mark_temp_password(uuid) to service_role;

-- Уже выданные и не сменённые временные пароли: текущий хэш и есть временный.
insert into private.temp_passwords (user_id, password_hash)
select u.id, u.encrypted_password
from auth.users u join public.profiles p on p.id = u.id
where p.must_change_password
on conflict (user_id) do nothing;

create or replace function public.clear_must_change_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  if exists (
    select 1 from private.temp_passwords t join auth.users u on u.id = t.user_id
    where t.user_id = v_uid and u.encrypted_password = t.password_hash
  ) then
    raise exception 'Сначала смените временный пароль' using errcode = '22023';
  end if;
  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.profiles set must_change_password = false where id = v_uid;
  perform set_config('bookspot.bypass_role_guard', 'off', true);
  delete from private.temp_passwords where user_id = v_uid;
end;
$$;
revoke execute on function public.clear_must_change_password() from public, anon;
grant execute on function public.clear_must_change_password() to authenticated;

create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql as $$
begin
  if current_setting('bookspot.bypass_role_guard', true) = 'on' then
    return new;
  end if;
  if new.role <> old.role or new.business_id is distinct from old.business_id then
    raise exception 'role и business_id нельзя менять напрямую';
  end if;
  if new.phone_verified <> old.phone_verified then
    raise exception 'phone_verified нельзя менять напрямую';
  end if;
  -- Снять «смените пароль» — только clear_must_change_password (после смены).
  if old.must_change_password and not new.must_change_password and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Сначала смените временный пароль' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ─── 5. Настройки бронирования салона ────────────────────────────────────

alter table public.businesses
  add constraint businesses_slot_step_range check (slot_step_min between 5 and 240),
  add constraint businesses_buffer_range check (buffer_min between 0 and 240),
  add constraint businesses_cancel_window_range check (cancel_window_hours between 0 and 168);
