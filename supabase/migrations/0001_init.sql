-- BookSpot — схема Фаз 0+1. Философия: где Postgres умеет решить задачу
-- constraint'ом или RLS-политикой — не пишем код, который это дублирует.
-- Главный пример: защита от двойного бронирования — это EXCLUDE constraint
-- в конце файла, а не транзакция с ручной проверкой пересечений (как
-- пришлось бы делать в Firestore).

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- EXCLUDE USING gist по uuid + tstzrange

-- ─── profiles ────────────────────────────────────────────────────────────
-- Один-в-один с auth.users, создаётся триггером при регистрации.

create type user_role as enum ('client', 'business_owner', 'staff');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  phone_verified boolean not null default false,
  lang text not null default 'ru' check (lang in ('az','ru','en')),
  role user_role not null default 'client',
  business_id uuid, -- FK добавится после создания businesses (ниже)
  fcm_token text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- role и business_id меняются только через SECURITY DEFINER функции
-- (create_business и т.п.), никогда напрямую с клиента. Такие функции
-- выставляют локальный GUC bookspot.bypass_role_guard=on перед своим
-- UPDATE — обычный клиентский запрос этого сделать не может, поэтому обход
-- недоступен снаружи.
create function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql as $$
begin
  if current_setting('bookspot.bypass_role_guard', true) = 'on' then
    return new;
  end if;
  if new.role <> old.role or new.business_id is distinct from old.business_id then
    raise exception 'role и business_id нельзя менять напрямую';
  end if;
  return new;
end;
$$;

create trigger profiles_no_self_promotion
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- Автосоздание профиля при регистрации. name/phone/lang приходят через
-- supabase.auth.signUp({ options: { data: {...} } }) в raw_user_meta_data.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, phone, lang)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'lang', 'ru')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── categories ──────────────────────────────────────────────────────────

create table public.categories (
  id text primary key,
  name_az text not null,
  name_ru text not null,
  name_en text not null,
  icon text,
  parent_id text references public.categories(id)
);

alter table public.categories enable row level security;
create policy "categories_public_read" on public.categories for select using (true);
-- запись — только сид-скриптом через service role, RLS-политики на insert/update нет.

-- ─── businesses ──────────────────────────────────────────────────────────

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  name text not null,
  category_id text not null references public.categories(id),
  description text not null default '',
  logo_url text,
  city text not null,
  district text,
  address text,
  phone text,
  status text not null default 'active' check (status in ('active','blocked')),
  slot_step_min int not null default 15,
  buffer_min int not null default 0,
  cancel_window_hours int not null default 4,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_business_id_fkey foreign key (business_id) references public.businesses(id);

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (business_id, user_id)
);

-- Хелпер для RLS-политик ниже: состоит ли auth.uid() в бизнесе. security
-- definer + stable, чтобы Postgres мог закэшировать результат в рамках запроса.
create function public.is_business_member(target_business_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.business_members
    where business_id = target_business_id and user_id = auth.uid()
  );
$$;

alter table public.businesses enable row level security;

create policy "businesses_public_read_active" on public.businesses
  for select using (status = 'active' or public.is_business_member(id));

create policy "businesses_member_write" on public.businesses
  for update using (public.is_business_member(id))
  with check (public.is_business_member(id));

alter table public.business_members enable row level security;
create policy "business_members_read_own_business" on public.business_members
  for select using (public.is_business_member(business_id));

-- ─── services / masters ──────────────────────────────────────────────────

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0,
  duration_min int not null check (duration_min > 0),
  active boolean not null default true
);

create table public.masters (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references public.profiles(id),
  name text not null,
  photo_url text,
  active boolean not null default true
);

-- Связь услуга↔мастер только в одну сторону (услуга знает своих мастеров) —
-- см. shared/slots.js: поток "услуга → мастер" запрашивает именно это
-- направление, двусторонняя денормализация только создаёт риск рассинхрона.
create table public.service_masters (
  service_id uuid not null references public.services(id) on delete cascade,
  master_id uuid not null references public.masters(id) on delete cascade,
  primary key (service_id, master_id)
);

alter table public.services enable row level security;
create policy "services_public_read" on public.services for select using (true);
create policy "services_member_write" on public.services
  for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

alter table public.masters enable row level security;
create policy "masters_public_read" on public.masters for select using (true);
create policy "masters_member_write" on public.masters
  for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

alter table public.service_masters enable row level security;
create policy "service_masters_public_read" on public.service_masters for select using (true);
create policy "service_masters_member_write" on public.service_masters
  for all using (
    exists (select 1 from public.services s where s.id = service_id and public.is_business_member(s.business_id))
  );

-- ─── расписание мастеров ─────────────────────────────────────────────────
-- Минуты от полуночи, целые — та же конвенция, что в shared/slots.js.

create table public.master_schedule (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.masters(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6), -- 0 = воскресенье
  start_min int not null check (start_min >= 0 and start_min < 1440),
  end_min int not null check (end_min > start_min and end_min <= 1440)
);

create table public.master_exceptions (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.masters(id) on delete cascade,
  date date not null,
  type text not null check (type in ('day_off','custom_hours')),
  unique (master_id, date)
);

create table public.master_exception_intervals (
  exception_id uuid not null references public.master_exceptions(id) on delete cascade,
  start_min int not null check (start_min >= 0 and start_min < 1440),
  end_min int not null check (end_min > start_min and end_min <= 1440)
);

alter table public.master_schedule enable row level security;
create policy "master_schedule_public_read" on public.master_schedule for select using (true);
create policy "master_schedule_member_write" on public.master_schedule
  for all using (
    exists (select 1 from public.masters m where m.id = master_id and public.is_business_member(m.business_id))
  );

alter table public.master_exceptions enable row level security;
create policy "master_exceptions_public_read" on public.master_exceptions for select using (true);
create policy "master_exceptions_member_write" on public.master_exceptions
  for all using (
    exists (select 1 from public.masters m where m.id = master_id and public.is_business_member(m.business_id))
  );

alter table public.master_exception_intervals enable row level security;
create policy "master_exception_intervals_public_read" on public.master_exception_intervals for select using (true);
create policy "master_exception_intervals_member_write" on public.master_exception_intervals
  for all using (
    exists (
      select 1 from public.master_exceptions e
      join public.masters m on m.id = e.master_id
      where e.id = exception_id and public.is_business_member(m.business_id)
    )
  );

-- ─── bookings — ядро продукта ────────────────────────────────────────────

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.profiles(id), -- null для записи "по звонку"
  client_name text,
  client_phone text,
  business_id uuid not null references public.businesses(id),
  master_id uuid not null references public.masters(id),
  service_id uuid not null references public.services(id),
  service_name text not null,
  price numeric(10,2) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','completed','no_show')),
  created_by text not null check (created_by in ('client','business')),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),

  -- Единственная защита от двойного бронирования, которая нужна: база сама
  -- отклоняет INSERT/UPDATE, если для этого мастера уже есть подтверждённая
  -- бронь с пересекающимся интервалом. "WHERE (status = 'confirmed')" —
  -- отменённые/завершённые брони не учитываются, слот освобождается отменой
  -- автоматически, без ручной синхронизации отдельного "daybook"-документа,
  -- которая понадобилась бы на Firestore.
  exclude using gist (master_id with =, during with &&) where (status = 'confirmed')
);

create index bookings_client_idx on public.bookings (client_id, starts_at desc);
create index bookings_business_idx on public.bookings (business_id, starts_at);
create index bookings_status_idx on public.bookings (status, starts_at);

alter table public.bookings enable row level security;

create policy "bookings_read_own_or_business" on public.bookings
  for select using (auth.uid() = client_id or public.is_business_member(business_id));

-- Прямая запись с клиента запрещена всегда — брони создаются только через
-- create_booking()/create_manual_booking() (SECURITY DEFINER, см. 0002).
create policy "bookings_no_direct_write" on public.bookings for insert with check (false);
create policy "bookings_no_direct_update" on public.bookings for update using (false);
