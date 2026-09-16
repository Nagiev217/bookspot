# BookSpot

Маркетплейс услуг + онлайн-бронирование для Баку. Одно приложение
(Expo/React Native), два режима — Client и Business — и Supabase (Postgres)
как бэкенд. Продуктовый концепт — `product-concept.md`.

## Структура репозитория

```
apps/mobile/          Expo-приложение (expo-router, src/app/*)
supabase/migrations/  Схема БД, RLS, RPC — применяются по номеру файла
scripts/              Сид и проверочные скрипты (обычный node, без фреймворка)
docs/                 Вспомогательные гайды (iOS-симулятор)
```

## Запуск приложения

```bash
cd apps/mobile
npm install
cp .env.example .env   # заполнить EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
npx expo start --dev-client
```

Нужен собственный dev-client (не Expo Go) — в проекте используются нативные
модули не из стандартного набора Expo Go.

## База данных

Миграции лежат в `supabase/migrations/000N_*.sql` и применяются по порядку
номеров. Локального Supabase не поднимаем — работаем напрямую с удалённым
проектом:

```bash
SUPABASE_ACCESS_TOKEN=<personal access token из supabase.com/dashboard/account/tokens> \
  npx supabase link --project-ref <project-ref>
SUPABASE_ACCESS_TOKEN=<тот же токен> npx supabase db push
```

Personal access token создаётся разово, project-scoped, права Project +
Database (не Full access).

## Скрипты

```bash
cd scripts
npm install
cp .env.example .env   # SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm run seed              # идемпотентно наполняет каталог тестовыми данными
npm run verify-booking    # 11 проверок ядра бронирования против живой базы
```

`SUPABASE_SERVICE_ROLE_KEY` обходит RLS — используется только в этих
скриптах, никогда в самом приложении.

## Соглашения проекта

- **Тесты** — обычные node-скрипты с ручными assert'ами (`scripts/verify-*.js`),
  без фреймворка. Один runnable-скрипт на нетривиальную фичу.
- **Часовой пояс** — Азербайджан UTC+4 без перехода на летнее время; сервер
  считает через нативный `'Asia/Baku'` (Postgres), клиент — вручную
  (`+4*3600000`, в React Native нет надёжной IANA tz-базы).
- **Все записи в `bookings`** идут только через SECURITY DEFINER RPC
  (`create_booking`, `cancel_booking`, `reschedule_booking`,
  `create_manual_booking`) — прямая запись с клиента запрещена RLS-политикой.
- **У `bookings` нет RLS DELETE-политики** — отмена это UPDATE статуса, не
  удаление строки. Скрипты, которым нужно физически удалить тестовые брони
  (`verify-booking.js`), делают это через service-role клиент.
