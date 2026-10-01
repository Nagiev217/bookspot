// Негативные и пограничные сценарии для App Store релиза — то, что
// verify-booking.js/verify-selfserve.js не покрывают: гостевой доступ,
// серверная валидация расписания (0016), дыры в правах (0017),
// жизненный цикл брони (0015) и удаление аккаунта (0013). Все сценарии из
// раздела "Проверка" плана релиза.
//
// Все фикстуры — свежесозданные тестовые пользователи и один тестовый
// бизнес, ничего из seed.js не трогается. Уборка идёт через service_role
// в finally независимо от исхода проверок.
//
// Запуск: cd scripts && npm run verify-release
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('Нужны SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY в scripts/.env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`✓ ${name}`);
  } else {
    console.log(`✗ ${name}${detail ? ' — ' + detail : ''}`);
    failed += 1;
  }
}

async function createTestUser(label) {
  const email = `verify-release-${label}-${Date.now()}@bookspot.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Test1234!',
    email_confirm: true,
    user_metadata: { name: label, lang: 'ru' },
  });
  if (error) throw error;
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (signErr) throw signErr;
  return { uid: data.user.id, client };
}

// Тот же приём, что в verify-selfserve.js: dow по конвенции Postgres
// extract(dow) — воскресенье=0 ... суббота=6.
function nextWeekday(dow) {
  const d = new Date();
  const diff = (dow + 7 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const owner = await createTestUser('owner');
  const client = await createTestUser('client');
  // Гость — anon-ключ без сессии, намеренно без signInWithPassword.
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  let businessId, serviceId, masterId, otherMasterId, bookingId;
  let clientDeleted = false;

  try {
    // ── Фикстуры: бизнес, услуга, мастер с расписанием только Пн-Пт ──────
    // Салоны создаёт admin (0022) — тот же RPC, что у Edge Function manage-accounts.
    const { data: bizId, error: bizErr } = await admin.rpc('admin_create_business', {
      p_owner_id: owner.uid,
      p_name: 'Verify Release Salon',
      p_category_id: 'barber',
      p_city: 'Баку',
      p_district: 'Ясамал',
      p_address: 'ул. Релизная 1',
      p_phone: '+994500000001',
      p_paid_until: null,
    });
    if (bizErr) throw bizErr;
    businessId = bizId;
    // Новый салон скрыт, пока не пройдён чек-лист (0024). Тестовым фикстурам
    // он не нужен — публикуем сразу через service_role.
    await admin.from('businesses').update({ published_at: new Date().toISOString() }).eq('id', businessId);

    const { data: service, error: svcErr } = await owner.client
      .from('services')
      .insert({ business_id: businessId, name: 'Verify Service', price: 20, duration_min: 30 })
      .select()
      .single();
    if (svcErr) throw svcErr;
    serviceId = service.id;

    const { data: master, error: mErr } = await owner.client
      .from('masters')
      .insert({ business_id: businessId, name: 'Verify Master' })
      .select()
      .single();
    if (mErr) throw mErr;
    masterId = master.id;

    const { error: smErr } = await owner.client.from('service_masters').insert({ service_id: serviceId, master_id: masterId });
    if (smErr) throw smErr;

    // Пн-Пт (1..5) — суббота/воскресенье намеренно без строк расписания:
    // это и есть сценарий "мастер не работает в выбранное время" без
    // отдельного master_exceptions.
    const rows = [1, 2, 3, 4, 5].map((dow) => ({ master_id: masterId, day_of_week: dow, start_min: 540, end_min: 1080 }));
    const { error: schErr } = await owner.client.from('master_schedule').insert(rows);
    if (schErr) throw schErr;

    // Второй мастер того же бизнеса, НЕ привязанный к service_masters —
    // нужен для сценария "мастер не выполняет эту услугу".
    const { data: otherMaster, error: omErr } = await owner.client
      .from('masters')
      .insert({ business_id: businessId, name: 'Другой мастер' })
      .select()
      .single();
    if (omErr) throw omErr;
    otherMasterId = otherMaster.id;

    const monday = nextWeekday(1);
    const saturday = nextWeekday(6);

    // ── Гость видит каталог и доступность, но не может забронировать ─────
    const { data: catalog, error: catErr } = await anon.from('businesses').select('id').eq('id', businessId).eq('status', 'active');
    check('гость видит салон в публичном каталоге', !catErr && catalog?.length === 1, catErr?.message);

    const guestAvail = await anon.rpc('get_availability', { p_master_id: masterId, p_service_id: serviceId, p_from: monday, p_days: 1 });
    check('гость видит доступное время без входа (0014_guest_catalog)', !guestAvail.error && guestAvail.data?.length > 0, guestAvail.error?.message);

    // create_booking выдан только authenticated (0003_availability.sql) —
    // у anon нет даже права выполнить функцию, поэтому конкретный код
    // ошибки тут не гарантирован (зависит от того, PostgREST отклонит на
    // уровне grant'а или функция успеет поднять свой '28000'); важен сам
    // факт отказа.
    const guestBooking = await anon.rpc('create_booking', {
      p_business_id: businessId,
      p_master_id: masterId,
      p_service_id: serviceId,
      p_date: monday,
      p_start: guestAvail.data?.[0]?.slot_time || '10:00',
    });
    check('гость не может создать бронь без входа', !!guestBooking.error, guestBooking.error?.message);

    // ── Серверная валидация расписания (0016_schedule_validation) ────────
    const yesterday = new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 10);
    const pastBooking = await client.client.rpc('create_booking', {
      p_business_id: businessId, p_master_id: masterId, p_service_id: serviceId, p_date: yesterday, p_start: '10:00',
    });
    check('бронь в прошлом отклонена', !!pastBooking.error?.message?.includes('прошедшее время'), pastBooking.error?.message);

    const dayOffBooking = await client.client.rpc('create_booking', {
      p_business_id: businessId, p_master_id: masterId, p_service_id: serviceId, p_date: saturday, p_start: '10:00',
    });
    check(
      'бронь вне расписания мастера (суббота) отклонена',
      !!dayOffBooking.error?.message?.includes('не работает в выбранное время'),
      dayOffBooking.error?.message
    );

    const wrongMasterBooking = await client.client.rpc('create_booking', {
      p_business_id: businessId, p_master_id: otherMasterId, p_service_id: serviceId, p_date: monday, p_start: '10:00',
    });
    check('бронь к мастеру без связи service_masters отклонена', wrongMasterBooking.error?.code === 'P0002', wrongMasterBooking.error?.message);

    // ── Дыры в правах (0017_rls_hardening) ────────────────────────────────
    const escalatePhone = await client.client.from('profiles').update({ phone_verified: true }).eq('id', client.uid);
    check('клиент не может выставить себе phone_verified напрямую', !!escalatePhone.error, escalatePhone.error?.message);

    const escalateStatus = await owner.client.from('businesses').update({ status: 'blocked' }).eq('id', businessId);
    check('участник не может сменить businesses.status напрямую', !!escalateStatus.error, escalateStatus.error?.message);

    // ── Валидная бронь → notification_outbox → жизненный цикл ────────────
    const goodBooking = await client.client.rpc('create_booking', {
      p_business_id: businessId, p_master_id: masterId, p_service_id: serviceId, p_date: monday, p_start: '11:00',
    });
    check('создание валидной брони проходит', !goodBooking.error && !!goodBooking.data?.[0]?.id, goodBooking.error?.message);
    bookingId = goodBooking.data?.[0]?.id;

    if (bookingId) {
      // С 0029 запись клиента — заявка: подтверждение и напоминание
      // появляются, когда салон её примет.
      const accepted = await owner.client.rpc('accept_booking', { p_booking_id: bookingId });
      check('владелец принимает заявку клиента (0029)', !accepted.error, accepted.error?.message);

      const { data: outboxRows } = await admin.from('notification_outbox').select('type').eq('booking_id', bookingId);
      const types = (outboxRows || []).map((r) => r.type);
      check(
        'notification_outbox наполняется при подтверждении брони (0018/0029)',
        types.includes('booking_confirmed') && types.includes('booking_reminder'),
        `типы в очереди: ${types.join(', ') || 'пусто'}`
      );

      const tooSoon = await owner.client.rpc('complete_booking', { p_booking_id: bookingId, p_status: 'completed' });
      check('complete_booking отклоняет визит, который ещё не наступил', !!tooSoon.error?.message?.includes('не наступил'), tooSoon.error?.message);

      // ── Отзыв нельзя оставить до завершения визита (0019_reviews.sql) ───
      const earlyReview = await client.client.rpc('create_review', { p_booking_id: bookingId, p_rating: 5, p_comment: null });
      check('отзыв на незавершённый визит отклонён', !!earlyReview.error?.message?.includes('завершённого визита'), earlyReview.error?.message);

      // service_role переводит бронь в прошлое напрямую (RLS этого не
      // разрешает клиенту) — имитирует "визит уже случился", не дожидаясь
      // реального времени.
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const pastEnd = new Date(Date.now() - 1800000).toISOString();
      await admin.from('bookings').update({ starts_at: pastStart, ends_at: pastEnd }).eq('id', bookingId);

      const complete1 = await owner.client.rpc('complete_booking', { p_booking_id: bookingId, p_status: 'completed' });
      check('complete_booking завершает прошедший визит', !complete1.error, complete1.error?.message);

      const complete2 = await owner.client.rpc('complete_booking', { p_booking_id: bookingId, p_status: 'completed' });
      check('повторный вызов complete_booking идемпотентен', !complete2.error, complete2.error?.message);

      const completeDiff = await owner.client.rpc('complete_booking', { p_booking_id: bookingId, p_status: 'no_show' });
      check('нельзя сменить статус уже завершённой брони', !!completeDiff.error, completeDiff.error?.message);

      // ── Отзыв на завершённый визит + пересчёт рейтинга (0019_reviews.sql) ─
      const goodReview = await client.client.rpc('create_review', { p_booking_id: bookingId, p_rating: 4, p_comment: 'Хороший сервис' });
      check('отзыв на завершённый визит создаётся', !goodReview.error && !!goodReview.data?.[0]?.id, goodReview.error?.message);

      const dupeReview = await client.client.rpc('create_review', { p_booking_id: bookingId, p_rating: 5, p_comment: null });
      check('повторный отзыв на ту же бронь отклонён', dupeReview.error?.code === '23505', dupeReview.error?.message);

      const { data: ratedBusiness } = await admin.from('businesses').select('rating_avg, review_count').eq('id', businessId).single();
      check(
        'rating_avg/review_count пересчитаны после отзыва',
        Number(ratedBusiness?.rating_avg) === 4 && ratedBusiness?.review_count === 1,
        JSON.stringify(ratedBusiness)
      );

      // ── delete_my_account обезличивает бронь, отзыв и удаляет профиль ────
      const delResult = await client.client.rpc('delete_my_account');
      check('delete_my_account выполняется без ошибки', !delResult.error, delResult.error?.message);
      if (!delResult.error) clientDeleted = true;

      const { data: anonymized } = await admin.from('bookings').select('client_id, client_name, client_phone').eq('id', bookingId).single();
      check(
        'бронь после удаления аккаунта обезличена, а не удалена',
        anonymized?.client_id === null && anonymized?.client_name === 'Удалённый пользователь',
        JSON.stringify(anonymized)
      );

      const { data: anonymizedReview } = await admin.from('reviews').select('client_id, client_name, rating').eq('booking_id', bookingId).maybeSingle();
      check(
        'отзыв после удаления аккаунта обезличен, а не удалён',
        anonymizedReview?.client_id === null && anonymizedReview?.client_name === 'Удалённый пользователь' && anonymizedReview?.rating === 4,
        JSON.stringify(anonymizedReview)
      );

      const { data: deletedProfile } = await admin.from('profiles').select('id').eq('id', client.uid).maybeSingle();
      check('профиль удалён вместе с аккаунтом', !deletedProfile, JSON.stringify(deletedProfile));
    }

    console.log(failed === 0 ? '\nВсе проверки пройдены.' : `\n${failed} проверок провалено.`);
  } finally {
    // Уборка через service_role — у bookings нет RLS DELETE-политики, а
    // client-аккаунт мог быть уже удалён самим delete_my_account.
    if (bookingId) await admin.from('bookings').delete().eq('id', bookingId);
    if (masterId) {
      await admin.from('master_schedule').delete().eq('master_id', masterId);
      await admin.from('service_masters').delete().eq('master_id', masterId);
      await admin.from('masters').delete().eq('id', masterId);
    }
    if (otherMasterId) await admin.from('masters').delete().eq('id', otherMasterId);
    if (serviceId) await admin.from('services').delete().eq('id', serviceId);
    if (businessId) {
      await admin.from('business_members').delete().eq('business_id', businessId);
      // profiles.business_id <-> businesses.owner_id — цикл с NO ACTION,
      // без отвязки через admin_unlink_business (0011) delete упал бы молча
      // (тот же баг, что уже однажды нашли в verify-selfserve.js).
      await admin.rpc('admin_unlink_business', { p_business_id: businessId });
      await admin.from('businesses').delete().eq('id', businessId);
    }
    await admin.auth.admin.deleteUser(owner.uid);
    if (!clientDeleted) await admin.auth.admin.deleteUser(client.uid);
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Проверка упала:', e.message || e);
  process.exit(1);
});
