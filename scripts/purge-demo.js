// Удаляет 10 демо-салонов из seed-baku-salons.js перед публикацией в App
// Store/Google Play — эти реально существующие заведения Баку не давали
// согласия быть в каталоге (см. комментарий в самом seed-baku-salons.js).
// Идемпотентно: салон, которого уже нет, просто пропускается.
//
// bookings НЕ каскадируется от businesses (сознательно, см. 0001_init.sql —
// у bookings вообще нет RLS-политики на DELETE, отмена это UPDATE статуса)
// — поэтому тестовые брони по этим салонам, если они появились во время
// разработки, удаляются явно, до удаления самого business. Всё остальное
// (services/masters/master_schedule/master_exceptions/service_masters/
// favorites) каскадируется от businesses автоматически.
//
// Сид-владелец (owner@bookspot.dev, seed.js) и его собственный салон НЕ
// трогаются — это рабочий тестовый аккаунт, не часть демо-каталога.
//
// Запуск: cd scripts && node --env-file=.env purge-demo.js
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в scripts/.env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Имена — один в один с seed-baku-salons.js, не пересчитываются оттуда,
// чтобы скрипт очистки не зависел от порядка/состава сид-скрипта во времени.
const DEMO_SALON_NAMES = [
  'BLACKOUT Барбершоп',
  'Eldar Studio',
  'KINGSTON',
  'Cahan studio',
  'AF BEAUTY STUDIO',
  'ALLURE STUDIO',
  'The Nail Bar',
  'Lash factor',
  'Центр массажной терапии',
  'AHMED TATTOO',
];

async function purgeSalon(name) {
  const { data: business, error: selErr } = await admin
    .from('businesses')
    .select('id')
    .eq('name', name)
    .eq('city', 'Баку')
    .maybeSingle();
  if (selErr) throw selErr;
  if (!business) {
    console.log(`- ${name} уже отсутствует — пропуск`);
    return;
  }

  const { error: bookingsErr, count } = await admin
    .from('bookings')
    .delete({ count: 'exact' })
    .eq('business_id', business.id);
  if (bookingsErr) throw bookingsErr;

  const { error: bizErr } = await admin.from('businesses').delete().eq('id', business.id);
  if (bizErr) throw bizErr;

  console.log(`✓ ${name} удалён${count ? ` (вместе с ${count} тестовыми бронями)` : ''}`);
}

async function main() {
  for (const name of DEMO_SALON_NAMES) {
    await purgeSalon(name);
  }
  console.log('\nГотово. Демо-каталог очищен, реальные партнёры остаются.');
}

main().catch((err) => {
  console.error('Скрипт упал:', err.message || err);
  process.exit(1);
});
