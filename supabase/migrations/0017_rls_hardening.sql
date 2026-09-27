-- Три независимые дыры в правах, найденные аудитом перед релизом:
--
-- 1) businesses_member_write (0001_init.sql) разрешает участнику бизнеса
--    UPDATE любой колонки, включая status и owner_id — сотрудник мог сам
--    снять блокировку своего бизнеса или переписать владельца на себя.
-- 2) profiles_update_own аналогично не ограничивает колонки — клиент мог
--    сам выставить себе phone_verified = true. Сейчас это поле нигде не
--    читается (телефон не верифицируется вообще, вход по email+паролю),
--    поэтому эксплуатировать нечего — но поле по смыслу означает
--    подтверждённый факт, и закрыть дыру сейчас дешевле, чем вспомнить
--    об этом уже после того, как верификация телефона появится.
-- 3) business_members имеет только SELECT-политику — добавить сотрудника
--    (роль staff) нельзя было ни через RLS, ни через RPC. Роль staff в
--    схеме заложена, но реально нерабочая.

-- ── 1+2: расширяем уже существующий guard на profiles тем же приёмом ──────
-- (bookspot.bypass_role_guard), что и раньше, плюс аналогичный триггер на
-- businesses — обе таблицы защищают "статусные" колонки одним и тем же
-- способом: GUC ставят только SECURITY DEFINER функции, обычный клиентский
-- UPDATE поставить его не может.
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
  return new;
end;
$$;

create function public.prevent_business_self_escalation()
returns trigger language plpgsql as $$
begin
  if current_setting('bookspot.bypass_role_guard', true) = 'on' then
    return new;
  end if;
  if new.status <> old.status or new.owner_id <> old.owner_id then
    raise exception 'status и owner_id нельзя менять напрямую';
  end if;
  return new;
end;
$$;

create trigger businesses_no_self_status_change
  before update on public.businesses
  for each row execute function public.prevent_business_self_escalation();

-- ── 3: владелец бизнеса может добавлять/убирать сотрудников ───────────────
-- user_id <> auth.uid() в delete — владелец не может случайно вычеркнуть
-- самого себя: is_business_member (0001_init.sql) читает именно эту
-- таблицу, и без своей же строки в ней он бы сам себе закрыл доступ к
-- управлению собственным бизнесом.
create policy "business_members_owner_insert" on public.business_members
  for insert with check (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

create policy "business_members_owner_delete" on public.business_members
  for delete using (
    exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
    and user_id <> auth.uid()
  );

-- ── Индексы на горячих путях (get_availability/assert_slot_bookable, а
--    также списки услуг/мастеров бизнеса) — раньше их не было вообще. ──────
create index services_business_idx on public.services (business_id);
create index masters_business_idx on public.masters (business_id);
create index master_schedule_master_idx on public.master_schedule (master_id);

-- У master_exception_intervals не было даже первичного ключа.
alter table public.master_exception_intervals add column id uuid primary key default gen_random_uuid();
create index master_exception_intervals_exception_idx on public.master_exception_intervals (exception_id);

-- ── Бакет photos — публичный и без ограничений с 0012_photos_storage.sql. ──
update storage.buckets
set file_size_limit = 5242880, -- 5 МБ
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'photos';
