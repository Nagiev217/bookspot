// Главная проверка этапа "Бизнес управляет своим салоном": заводит бизнес,
// услугу, мастера, расписание и принимает бронь клиента — всё через RLS с
// реальным JWT (не service role), тем же путём, что и экраны
// become-partner.jsx / services/[businessId].jsx / team.jsx /
// master/[masterId].jsx. Ни одной строки из seed.js не используется.
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('Нужны SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY в scripts/.env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function assert(cond, message) {
  if (!cond) throw new Error('FAIL: ' + message);
  console.log('✓', message);
}

function nextWeekday(dow) {
  const d = new Date();
  const diff = (dow + 7 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function createTestUser(label) {
  const email = `verify-selfserve-${label}-${Date.now()}@bookspot.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Test1234!',
    email_confirm: true,
    user_metadata: { name: label, lang: 'ru' },
  });
  if (error) throw error;
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error: signErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (signErr) throw signErr;
  return { uid: data.user.id, client };
}

async function main() {
  const owner = await createTestUser('owner');
  const client = await createTestUser('client');
  let businessId, serviceId, masterId, bookingId;

  try {
    // Салон создаёт admin (0022), дальше владелец сам ведёт услуги, мастеров
    // и расписание — это и есть «самообслуживание» после подключения.
    const { data: bizId, error: bizErr } = await admin.rpc('admin_create_business', {
      p_owner_id: owner.uid,
      p_name: 'Selfserve Verify Salon',
      p_category_id: 'barber',
      p_city: 'Баку',
      p_district: 'Ясамал',
      p_address: 'ул. Тестовая 1',
      p_phone: '+994500000000',
      p_paid_until: null,
    });
    if (bizErr) throw bizErr;
    businessId = bizId;
    // Новый салон скрыт, пока не пройдён чек-лист (0024). Тестовым фикстурам
    // он не нужен — публикуем сразу через service_role.
    await admin.from('businesses').update({ published_at: new Date().toISOString() }).eq('id', businessId);
    assert(!!businessId, 'admin создаёт салон с владельцем через admin_create_business()');

    const { data: service, error: svcErr } = await owner.client
      .from('services')
      .insert({ business_id: businessId, name: 'Verify Service', price: 20, duration_min: 30 })
      .select()
      .single();
    if (svcErr) throw svcErr;
    serviceId = service.id;
    assert(!!serviceId, 'владелец создаёт услугу напрямую под RLS');

    const { data: master, error: mErr } = await owner.client.from('masters').insert({ business_id: businessId, name: 'Verify Master' }).select().single();
    if (mErr) throw mErr;
    masterId = master.id;
    assert(!!masterId, 'владелец создаёт мастера напрямую под RLS');

    const { error: smErr } = await owner.client.from('service_masters').insert({ service_id: serviceId, master_id: masterId });
    if (smErr) throw smErr;
    assert(true, 'владелец привязывает услугу к мастеру');

    const rows = [1, 2, 3, 4, 5].map((dow) => ({ master_id: masterId, day_of_week: dow, start_min: 540, end_min: 1080 }));
    const { error: schErr } = await owner.client.from('master_schedule').insert(rows);
    if (schErr) throw schErr;
    assert(true, 'владелец задаёт недельное расписание мастера');

    const monday = nextWeekday(1);
    const { data: avail, error: availErr } = await client.client.rpc('get_availability', {
      p_master_id: masterId,
      p_service_id: serviceId,
      p_from: monday,
      p_days: 1,
    });
    if (availErr) throw availErr;
    assert(avail.length > 0, `get_availability отдаёт слоты нового мастера (${avail.length} на ${monday})`);

    const { data: booking, error: bookErr } = await client.client.rpc('create_booking', {
      p_business_id: businessId,
      p_master_id: masterId,
      p_service_id: serviceId,
      p_date: monday,
      p_start: avail[0].slot_time,
    });
    if (bookErr) throw bookErr;
    bookingId = booking[0].id;
    assert(!!bookingId, 'клиент записывается к новому мастеру через create_booking()');

    const { data: listed, error: listErr } = await client.client.from('businesses').select('id').eq('id', businessId).eq('status', 'active');
    if (listErr) throw listErr;
    assert(listed.length === 1, 'новый салон виден в публичном каталоге');

    console.log('\nВсе проверки пройдены — самообслуживание бизнеса работает end-to-end.');
  } finally {
    // Уборка через service role — у bookings нет RLS DELETE-политики.
    if (bookingId) await admin.from('bookings').delete().eq('id', bookingId);
    if (masterId) {
      await admin.from('master_schedule').delete().eq('master_id', masterId);
      await admin.from('service_masters').delete().eq('master_id', masterId);
      await admin.from('masters').delete().eq('id', masterId);
    }
    if (serviceId) await admin.from('services').delete().eq('id', serviceId);
    if (businessId) {
      await admin.from('business_members').delete().eq('business_id', businessId);
      // profiles.business_id -> businesses и businesses.owner_id -> profiles
      // образуют цикл с NO ACTION: без снятия ссылки через
      // admin_unlink_business (0011) delete business упал бы молча —
      // именно так эта проверка два раза подряд не удалила за собой тестовые
      // бизнес и владельца, пока баг не вскрылся вручную.
      await admin.rpc('admin_unlink_business', { p_business_id: businessId });
      await admin.from('businesses').delete().eq('id', businessId);
    }
    await admin.auth.admin.deleteUser(owner.uid);
    await admin.auth.admin.deleteUser(client.uid);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
