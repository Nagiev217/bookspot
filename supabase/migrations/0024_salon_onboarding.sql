-- Настройка нового салона перед публикацией.
--
-- До этой миграции салон, созданный admin'ом (admin_create_business), сразу
-- появлялся в каталоге — пустой: без описания, фото, услуг и мастеров.
-- Теперь новый салон скрыт от клиентов (published_at is null), пока
-- владелец не пройдёт чек-лист (business_setup_status) и не нажмёт
-- «Опубликовать» (publish_business). Существующие салоны остаются
-- опубликованными.

-- ─── Публикация ──────────────────────────────────────────────────────────

alter table public.businesses add column published_at timestamptz;
-- Обход защиты полей на время бэкфилла (триггер из 0017/0022).
select set_config('bookspot.bypass_role_guard', 'on', false);
update public.businesses set published_at = created_at;
select set_config('bookspot.bypass_role_guard', 'off', false);

-- published_at — как paid_until: владелец напрямую не ставит, только через
-- publish_business. service_role (сид и проверочные скрипты) — может.
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
  return new;
end;
$$;

-- ─── Галерея салона (до 5 фото) ──────────────────────────────────────────

create table public.business_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  url text not null,
  storage_path text, -- null у фото, перенесённых из старого logo_url со внешним URL
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index business_photos_business_idx on public.business_photos (business_id, position);

alter table public.business_photos enable row level security;

-- Видимость наследует салон: exists идёт через RLS businesses, так что
-- фото неопубликованного салона видят только его участники и admin.
create policy "business_photos_read" on public.business_photos
  for select using (exists (select 1 from public.businesses b where b.id = business_id));

create policy "business_photos_owner_write" on public.business_photos
  for all using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

create function public.limit_business_photos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Сериализуем параллельные загрузки одного салона, иначе две вставки
  -- одновременно обе увидят 4 фото и получится 6.
  perform 1 from public.businesses where id = new.business_id for update;
  if (select count(*) from public.business_photos where business_id = new.business_id) >= 5 then
    raise exception 'Можно загрузить не больше 5 фото' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger business_photos_limit
  before insert on public.business_photos
  for each row execute function public.limit_business_photos();

-- Обложка: logo_url = первое фото галереи. Каталог, поиск и избранное
-- продолжают читать logo_url без изменений.
create function public.sync_business_cover()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid := coalesce(new.business_id, old.business_id);
  v_prev text := coalesce(current_setting('bookspot.bypass_role_guard', true), '');
begin
  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.businesses b
  set logo_url = (
    select p.url from public.business_photos p
    where p.business_id = v_business_id
    order by p.position, p.created_at
    limit 1
  )
  where b.id = v_business_id;
  -- Возвращаем как было: вызывающий RPC мог сам включить обход.
  perform set_config('bookspot.bypass_role_guard', v_prev, true);
  return null;
end;
$$;

create trigger business_photos_sync_cover
  after insert or update or delete on public.business_photos
  for each row execute function public.sync_business_cover();

-- Перенос старого одиночного фото в галерею.
insert into public.business_photos (business_id, url, storage_path, position)
select b.id, b.logo_url, substring(b.logo_url from '/object/public/photos/([^?]+)'), 0
from public.businesses b
where b.logo_url is not null and b.logo_url <> '';

-- ─── Чек-лист ────────────────────────────────────────────────────────────

create function public.business_setup_status(p_business_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_description text;
  v_published_at timestamptz;
  v_photos int;
  v_masters boolean;
  v_schedule boolean;
  v_services boolean;
begin
  if not (public.is_business_member(p_business_id) or public.is_platform_admin()) then
    raise exception 'Нет доступа к этому салону' using errcode = '42501';
  end if;

  select b.description, b.published_at into v_description, v_published_at
  from public.businesses b where b.id = p_business_id;
  if not found then
    raise exception 'Салон не найден' using errcode = '22023';
  end if;

  select count(*)::int into v_photos from public.business_photos p where p.business_id = p_business_id;

  select exists (
    select 1 from public.masters m where m.business_id = p_business_id and m.active
  ) into v_masters;

  select exists (
    select 1 from public.masters m
    join public.master_schedule ms on ms.master_id = m.id
    where m.business_id = p_business_id and m.active
  ) into v_schedule;

  -- Услуга засчитывается, только если по ней реально можно записаться:
  -- активная, с активным мастером, у которого есть рабочие часы.
  select exists (
    select 1 from public.services s
    join public.service_masters sm on sm.service_id = s.id
    join public.masters m on m.id = sm.master_id and m.active
    where s.business_id = p_business_id and s.active
      and exists (select 1 from public.master_schedule ms where ms.master_id = m.id)
  ) into v_services;

  return jsonb_build_object(
    'description', length(trim(coalesce(v_description, ''))) >= 30,
    'photos', v_photos >= 1,
    'photos_count', v_photos,
    'masters', v_masters,
    'schedule', v_schedule,
    'services', v_services,
    'published', v_published_at is not null
  );
end;
$$;

revoke all on function public.business_setup_status from public;
grant execute on function public.business_setup_status to authenticated;

create function public.publish_business(p_business_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status jsonb;
  v_missing text[] := '{}';
  v_published_at timestamptz;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Опубликовать салон может только владелец' using errcode = '42501';
  end if;

  select b.published_at into v_published_at from public.businesses b where b.id = p_business_id;
  if v_published_at is not null then
    return v_published_at;
  end if;

  v_status := public.business_setup_status(p_business_id);
  if not (v_status->>'description')::boolean then v_missing := v_missing || 'описание (от 30 символов)'; end if;
  if not (v_status->>'photos')::boolean then v_missing := v_missing || 'фото салона'; end if;
  if not (v_status->>'masters')::boolean then v_missing := v_missing || 'мастера'; end if;
  if not (v_status->>'schedule')::boolean then v_missing := v_missing || 'расписание мастера'; end if;
  if not (v_status->>'services')::boolean then v_missing := v_missing || 'услуги с мастером'; end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Чтобы опубликовать салон, добавьте: %', array_to_string(v_missing, ', ')
      using errcode = '22023';
  end if;

  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.businesses set published_at = now() where id = p_business_id
  returning published_at into v_published_at;
  return v_published_at;
end;
$$;

revoke all on function public.publish_business from public;
grant execute on function public.publish_business to authenticated;

-- ─── Скрытие неопубликованных ────────────────────────────────────────────

drop policy "businesses_public_read_active" on public.businesses;
create policy "businesses_public_read_active" on public.businesses
  for select using (
    (status = 'active'
      and published_at is not null
      and (paid_until is null or paid_until >= (now() at time zone 'Asia/Baku')::date))
    or public.is_business_member(id)
    or public.is_platform_admin()
  );

create or replace function public.business_is_bookable(target_business_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.businesses b
    where b.id = target_business_id
      and b.status = 'active'
      and b.published_at is not null
      and (b.paid_until is null or b.paid_until >= (now() at time zone 'Asia/Baku')::date)
  );
$$;

-- ─── Админка: статус публикации в списке салонов ─────────────────────────

drop function public.admin_list_businesses();
create function public.admin_list_businesses()
returns table (
  id uuid, name text, category_id text, city text, district text, phone text,
  status text, paid_until date, created_at timestamptz, published_at timestamptz,
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
         b.status, b.paid_until, b.created_at, b.published_at,
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
