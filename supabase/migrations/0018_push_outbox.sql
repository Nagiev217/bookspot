-- Push-уведомления: до сих пор их не было вообще. expo-notifications стоял
-- в зависимостях, savePushToken() (profile.js) был написан, но никогда не
-- вызывался; bookings.reminder_sent_at существовал в схеме с 0001_init.sql,
-- но никогда не заполнялся. Для сервиса записи это не украшение, а базовая
-- функция — подтверждение и напоминание клиенту, уведомление бизнесу о
-- новой брони.
--
-- Схема: очередь (notification_outbox), а не прямая отправка из RPC —
-- напоминание нужно отправить НЕ в момент создания брони, а за 2 часа до
-- визита, когда сама бронь давно создана и приложение, скорее всего,
-- закрыто. pg_cron диспетчерит очередь раз в минуту, дёргая Edge Function
-- push-dispatch, которая уже делает настоящий HTTP-вызов к Expo Push API.
--
-- ВАЖНО, разовая ручная настройка после применения этой миграции (не
-- автоматизируется отсюда — нужен реальный service_role key, которого нет
-- в этой миграции сознательно, секреты в SQL-файлы не кладём):
--   1. Задеплоить функцию: supabase functions deploy push-dispatch
--   2. Один раз сохранить service_role key в Vault (SQL Editor в дашборде):
--      select vault.create_secret('<ваш service_role key>', 'service_role_key');
--   3. Проверить, что cron.schedule ниже реально создал задачу:
--      select * from cron.job;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  type text not null check (type in ('booking_confirmed', 'booking_reminder', 'booking_cancelled', 'new_booking_business')),
  title text not null,
  body text not null,
  data jsonb,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index notification_outbox_pending_idx on public.notification_outbox (send_after) where sent_at is null;

-- RLS включён БЕЗ политик — эта таблица не для клиентского чтения/записи
-- вообще, только push-dispatch (service_role, обходит RLS) её обслуживает.
alter table public.notification_outbox enable row level security;

-- Наполняет очередь при создании/отмене брони — единой функцией на оба
-- триггера, чтобы не дублировать логику формирования текста уведомления.
-- SECURITY DEFINER — как и handle_new_user (0001_init.sql), тот же приём:
-- триггер должен писать в защищённую RLS-без-политик таблицу независимо от
-- того, кто вызвал исходную операцию над bookings.
create function public.enqueue_booking_notifications()
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
      values (
        new.client_id, new.id, 'booking_confirmed',
        'Запись подтверждена',
        new.service_name || ' — ' || v_when,
        now()
      );
      -- За 2 часа до визита. Если бронь создана позже этой отметки (визит
      -- уже скоро), send_after окажется в прошлом — push-dispatch просто
      -- отправит его при первом же тике вместо того, чтобы молча потерять.
      insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
      values (
        new.client_id, new.id, 'booking_reminder',
        'Напоминание о записи',
        new.service_name || ' сегодня в ' || to_char(new.starts_at at time zone 'Asia/Baku', 'HH24:MI'),
        new.starts_at - interval '2 hours'
      );
    end if;

    insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
    select bm.user_id, new.id, 'new_booking_business',
      'Новая запись',
      coalesce(new.client_name, 'Клиент') || ' — ' || new.service_name || ', ' || v_when,
      now()
    from public.business_members bm
    where bm.business_id = new.business_id;

  elsif TG_OP = 'UPDATE' and new.status = 'cancelled' and old.status = 'confirmed' then
    -- Неотправленное напоминание больше не нужно — визита не будет.
    delete from public.notification_outbox
    where booking_id = new.id and type = 'booking_reminder' and sent_at is null;

    if new.client_id is not null then
      insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
      values (
        new.client_id, new.id, 'booking_cancelled',
        'Запись отменена',
        new.service_name || ' — ' || v_when,
        now()
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger bookings_notify_after_insert
  after insert on public.bookings
  for each row execute function public.enqueue_booking_notifications();

create trigger bookings_notify_after_update
  after update on public.bookings
  for each row execute function public.enqueue_booking_notifications();

-- Раз в минуту — Edge Function сама забирает пачку "созревших" уведомлений
-- (send_after <= now(), sent_at is null) и шлёт их через Expo Push API.
-- service_role key достаётся из Vault, а не хранится в теле job'а — см.
-- пункт 2 инструкции в шапке файла.
select cron.schedule(
  'push-dispatch-every-minute',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://uuklytehdhirblhxbgfv.supabase.co/functions/v1/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);
