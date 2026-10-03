// Минимальная обязательная проверка ядра бронирования на реальной базе:
// создание брони, идемпотентность повторной отправки, отказ на
// пересекающийся слот, разрешение стыкового слота. Все тестовые брони
// удаляются в конце — сид не засоряется.
//
// Запуск: cd scripts && npm run verify-booking
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('Нужны SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY в scripts/.env');
  process.exit(1);
}

// bookings намеренно не имеет RLS-политики на DELETE (отмена — это UPDATE
// status через cancel_booking, не удаление строки) — обычный
// анонимный-клиент .delete() всегда молча удаляет 0 строк. Уборка после
// теста поэтому идёт через service_role, который обходит RLS целиком.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const OWNER_EMAIL = 'owner@bookspot.dev';
const OWNER_PASSWORD = 'Seed12345!';

let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log(`✓ ${name}`);
  } else {
    console.log(`✗ ${name}`);
    failed += 1;
  }
}

async function main() {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signIn, error: signInErr } = await client.auth.signInWithPassword({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  if (signInErr) throw new Error(`Не удалось войти как ${OWNER_EMAIL}: ${signInErr.message}. Запустите сначала npm run seed.`);

  // Сначала салон, потом мастер и услуга только в нём: «Стрижка + борода»
  // есть и у демо-салонов из seed-baku-salons.js, без фильтра .single() падает.
  const { data: business } = await client.from('businesses').select('id').eq('name', 'Atelier Nizami').single();
  if (!business) throw new Error('Сид-данные не найдены — запустите npm run seed');
  const { data: master } = await client.from('masters').select('id, name').eq('business_id', business.id).eq('name', 'Тогрул').single();
  const { data: service } = await client.from('services').select('id, duration_min').eq('business_id', business.id).eq('name', 'Стрижка + борода').single();
  if (!master || !service) throw new Error('Сид-данные не найдены — запустите npm run seed');

  // Ближайший будний день, не сегодня: у сид-мастера воскресенье выходной,
  // а «завтра» в субботу давало ложный провал.
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  const date = d.toISOString().slice(0, 10);
  const args = { p_business_id: business.id, p_master_id: master.id, p_service_id: service.id, p_date: date };
  const created = [];

  const r1 = await client.rpc('create_booking', { ...args, p_start: '10:00' });
  check('создание брони', !r1.error && r1.data?.[0]?.id);
  if (r1.data?.[0]?.id) created.push(r1.data[0].id);

  const r2 = await client.rpc('create_booking', { ...args, p_start: '10:00' });
  check('повтор того же запроса — та же бронь, не дубль', r2.data?.[0]?.id === r1.data?.[0]?.id);

  const r3 = await client.rpc('create_booking', { ...args, p_start: '10:30' });
  // С 0016 пересечение отсекает ещё assert_slot_bookable (занятое время
  // вычитается из свободного, код 22023) — до EXCLUDE-constraint (23P01)
  // дело доходит только при одновременной гонке двух запросов.
  check('пересекающийся слот отклонён', ['23P01', '22023'].includes(r3.error?.code), `${r3.error?.code} ${r3.error?.message}`);

  const r4 = await client.rpc('create_booking', { ...args, p_start: '11:10' });
  check(`стыковый слот (${service.duration_min} мин ровно до 11:10) разрешён`, !r4.error && r4.data?.[0]?.id);
  if (r4.data?.[0]?.id) created.push(r4.data[0].id);

  const avail = await client.rpc('get_availability', {
    p_master_id: master.id,
    p_service_id: service.id,
    p_from: date,
    p_days: 1,
  });
  const times = (avail.data || []).map((r) => r.slot_time);
  check('get_availability не предлагает занятые слоты 10:00 и 11:10', !times.includes('10:00') && !times.includes('11:10'));

  const resched = await client.rpc('reschedule_booking', { p_booking_id: r1.data[0].id, p_date: date, p_start: '13:00' });
  check('перенос брони на новое время', !resched.error && resched.data?.[0]?.starts_at);

  const availAfterResched = await client.rpc('get_availability', {
    p_master_id: master.id, p_service_id: service.id, p_from: date, p_days: 1,
  });
  const timesAfter = (availAfterResched.data || []).map((r) => r.slot_time);
  check('после переноса старый слот 10:00 освободился, новый 13:00 занят', timesAfter.includes('10:00') && !timesAfter.includes('13:00'));

  const cancel = await client.rpc('cancel_booking', { p_booking_id: r1.data[0].id });
  check('отмена брони', !cancel.error);

  const cancelAgain = await client.rpc('cancel_booking', { p_booking_id: r1.data[0].id });
  check('повторная отмена отклонена', cancelAgain.error?.message?.includes('нельзя отменить'));

  const rClientName = await client.from('bookings').select('client_name').eq('id', r1.data[0].id).single();
  check('create_booking денормализует имя клиента', !!rClientName.data?.client_name);

  const rManual = await client.rpc('create_manual_booking', {
    p_business_id: business.id, p_master_id: master.id, p_service_id: service.id,
    p_date: date, p_start: '15:00', p_client_name: 'Проверочный Клиент', p_client_phone: '+994500000000',
  });
  check('ручная запись (create_manual_booking)', !rManual.error && rManual.data?.[0]?.id);
  if (rManual.data?.[0]?.id) created.push(rManual.data[0].id);

  for (const id of created) {
    await admin.from('bookings').delete().eq('id', id);
  }

  console.log(failed === 0 ? `\n${created.length ? 'Все проверки прошли' : 'OK'}, тестовые брони удалены.` : `\n${failed} проверок провалено.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Проверка упала:', e.message || e);
  process.exit(1);
});
