// Сквозной сценарий «как в жизни»: гость → клиент → запись → владелец
// принимает → визит → отзыв, и параллельно путь нового владельца от
// создания салона до первой записи. Те же запросы, что делает приложение.
// Печатает каждый шаг и всё, что пошло не так или выглядит странно.
// Тестовые данные удаляются в finally.
//
// Запуск: cd scripts && node --env-file=.env journey.js
'use strict';
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const stamp = Date.now();
const notes = [];
const step = (s) => console.log('→', s);
const note = (s) => {
  notes.push(s);
  console.log('  ⚠', s);
};

async function signUp(label, name) {
  const email = `journey-${label}-${stamp}@bookspot.dev`;
  const c = createClient(URL, ANON, opts);
  const { data, error } = await c.auth.signUp({ email, password: 'Journey123!', options: { data: { name, lang: 'az' } } });
  if (error) throw error;
  if (!data.session) note(`регистрация ${label}: сессии нет сразу (нужно подтверждение email)`);
  return { uid: data.user.id, client: c, email };
}
function nextWeekday(dow) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((dow + 7 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

(async () => {
  const anon = createClient(URL, ANON, opts);
  const cleanup = { users: [], businessId: null };
  try {
    // ── ВЛАДЕЛЕЦ: салон создан админом ─────────────────────────────────
    step('Владелец: админ создаёт салон');
    const owner = await signUp('owner', 'Leyla');
    cleanup.users.push(owner.uid);
    const { data: bid, error: be } = await admin.rpc('admin_create_business', {
      p_owner_id: owner.uid, p_name: 'Journey Beauty', p_category_id: 'beauty', p_city: 'Bakı',
      p_district: 'Nəsimi', p_address: null, p_phone: '+994501112233', p_paid_until: null,
    });
    if (be) throw be;
    cleanup.businessId = bid;

    step('Владелец: проходит чек-лист');
    await owner.client.from('businesses').update({ description: 'Gözəllik salonu: saç, makiyaj, manikür. Peşəkar ustalar.', lat: 40.38, lng: 49.85 }).eq('id', bid);
    await owner.client.from('business_photos').insert({ business_id: bid, url: 'https://example.com/x.jpg', position: 0 });
    const { data: m } = await owner.client.from('masters').insert({ business_id: bid, name: 'Aysel' }).select().single();
    const { data: svc } = await owner.client.from('services').insert({ business_id: bid, name: 'Saç kəsimi', price: 25, duration_min: 45 }).select().single();
    await owner.client.from('service_masters').insert({ service_id: svc.id, master_id: m.id });
    await owner.client.from('master_schedule').insert([1, 2, 3, 4, 5, 6].map((d) => ({ master_id: m.id, day_of_week: d, start_min: 600, end_min: 1140 })));
    const pub = await owner.client.rpc('publish_business', { p_business_id: bid });
    if (pub.error) note('публикация: ' + pub.error.message);

    // ── КЛИЕНТ: гость ──────────────────────────────────────────────────
    step('Гость: находит салон в каталоге и смотрит слоты');
    const { data: cat } = await anon.from('businesses').select('id,name').eq('id', bid);
    if (!cat?.length) note('гость не видит опубликованный салон');
    const monday = nextWeekday(1);
    const { data: slots } = await anon.rpc('get_availability', { p_master_id: m.id, p_service_id: svc.id, p_from: monday, p_days: 1 });
    step(`  слотов в понедельник: ${slots?.length}`);
    const { data: catsAz } = await anon.from('categories').select('name_az').eq('id', 'beauty').single();
    step(`  категория на az: ${catsAz?.name_az}`);

    // ── КЛИЕНТ: регистрация и запись ───────────────────────────────────
    step('Клиент: регистрируется');
    const client = await signUp('client', 'Orxan');
    cleanup.users.push(client.uid);
    const { data: prof } = await client.client.from('profiles').select('name,phone,lang').eq('id', client.uid).single();
    if (!prof?.phone) note('у клиента нет телефона: регистрация его не спрашивает, а салону нечем связаться');

    step('Клиент: записывается');
    const bk = await client.client.rpc('create_booking', { p_business_id: bid, p_master_id: m.id, p_service_id: svc.id, p_date: monday, p_start: slots?.[0]?.slot_time || '10:00' });
    if (bk.error) throw bk.error;
    const bookingId = bk.data[0].id;

    // ── ВЛАДЕЛЕЦ: заявка ───────────────────────────────────────────────
    step('Владелец: видит заявку и принимает');
    const { data: req } = await owner.client.from('bookings').select('status,client_name,client_phone').eq('id', bookingId).single();
    if (!req.client_phone) note('в заявке нет телефона клиента — кнопка «Позвонить» не появится');
    const { data: ownerOut } = await admin.from('notification_outbox').select('title').eq('booking_id', bookingId).eq('user_id', owner.uid);
    step(`  push владельцу: ${ownerOut?.map((x) => x.title).join(', ')}`);
    await owner.client.rpc('accept_booking', { p_booking_id: bookingId });
    const { data: clientOut } = await admin.from('notification_outbox').select('title,body').eq('booking_id', bookingId).eq('user_id', client.uid);
    step(`  push клиенту (az): ${clientOut?.map((x) => x.title).join(' | ')}`);

    // ── Визит прошёл → отзыв ───────────────────────────────────────────
    step('Визит прошёл: владелец отмечает, клиент оставляет отзыв');
    await admin.from('bookings').update({ starts_at: new Date(Date.now() - 3 * 3600e3).toISOString(), ends_at: new Date(Date.now() - 2.25 * 3600e3).toISOString() }).eq('id', bookingId);
    const comp = await owner.client.rpc('complete_booking', { p_booking_id: bookingId, p_status: 'completed' });
    if (comp.error) note('отметка визита: ' + comp.error.message);
    const rv = await client.client.rpc('create_review', { p_booking_id: bookingId, p_rating: 5, p_comment: 'Əla!' });
    if (rv.error) note('отзыв: ' + rv.error.message);
    const { data: biz } = await anon.from('businesses').select('rating_avg,review_count').eq('id', bid).single();
    step(`  рейтинг: ${biz?.rating_avg} (${biz?.review_count})`);
    const { data: reviewOut } = await admin.from('notification_outbox').select('title').eq('user_id', owner.uid).eq('booking_id', bookingId);
    if (!reviewOut?.some((x) => /отзыв|rəy|review/i.test(x.title))) note('владелец не получает уведомление о новом отзыве');
    const { data: askReview } = await admin.from('notification_outbox').select('title').eq('user_id', client.uid).eq('booking_id', bookingId);
    if (!askReview?.some((x) => /отзыв|rəy|review/i.test(x.title))) note('клиенту после визита не приходит просьба оставить отзыв');

    // ── Повторная запись, отмена в окне ────────────────────────────────
    step('Клиент: вторая запись на завтра и отмена');
    const tomorrow = new Date(Date.now() + 4 * 3600e3 + 86400e3);
    const tDate = tomorrow.toISOString().slice(0, 10);
    const { data: s2 } = await anon.rpc('get_availability', { p_master_id: m.id, p_service_id: svc.id, p_from: tDate, p_days: 1 });
    if (s2?.length) {
      const b2 = await client.client.rpc('create_booking', { p_business_id: bid, p_master_id: m.id, p_service_id: svc.id, p_date: tDate, p_start: s2[0].slot_time });
      const c2 = await client.client.rpc('cancel_booking', { p_booking_id: b2.data?.[0]?.id });
      if (c2.error) note('отмена заявки: ' + c2.error.message);
    }
  } catch (e) {
    note('сценарий упал: ' + (e.message || e));
  } finally {
    if (cleanup.businessId) {
      await admin.from('bookings').delete().eq('business_id', cleanup.businessId);
      await admin.from('business_members').delete().eq('business_id', cleanup.businessId);
      await admin.rpc('admin_unlink_business', { p_business_id: cleanup.businessId });
      await admin.from('businesses').delete().eq('id', cleanup.businessId);
    }
    for (const u of cleanup.users) await admin.auth.admin.deleteUser(u);
    console.log(`\nЗамечаний: ${notes.length}`);
  }
})();
