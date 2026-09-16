-- Избранное — просто "какие бизнесы отметил клиент", без отдельного RPC:
-- клиент читает/пишет только свои строки напрямую под RLS, как
-- services/masters у бизнеса в 0001_init.sql.
create table favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

alter table favorites enable row level security;

create policy "favorites_own_read" on favorites for select
  using (user_id = auth.uid());

create policy "favorites_own_insert" on favorites for insert
  with check (user_id = auth.uid());

create policy "favorites_own_delete" on favorites for delete
  using (user_id = auth.uid());
