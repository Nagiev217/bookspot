// Проверка 0024 на живой базе: новый салон скрыт, пока владелец не пройдёт
// чек-лист (описание, фото, мастер, расписание, услуга с мастером) и не
// нажмёт «Опубликовать». Все тестовые пользователи и данные удаляются в
// finally.
//
// Нужны задеплоенные миграции до 0024 и функция manage-accounts.
// Запуск: cd scripts && npm run verify-onboarding
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('Нужны SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY в scripts/.env');
  process.exit(1);
}

const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, opts);
const stamp = Date.now();
// 1×1 прозрачный PNG — настоящий файл для проверки storage-политики галереи.
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log(`✓ ${name}`);
  else {
    console.log(`✗ ${name}${detail ? ' — ' + detail : ''}`);
    failed += 1;
  }
}

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, opts);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { uid: data.user.id, client };
}

async function createTestUser(label) {
  const email = `verify-onb-${label}-${stamp}@bookspot.dev`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true, user_metadata: { name: label } });
  if (error) throw error;
  return signIn(email, 'Test1234!');
}

async function callFn(client, body) {
  const { data, error } = await client.functions.invoke('manage-accounts', { body });
  if (!error) return { status: 200, data };
  let msg = error.message;
  try {
    msg = (await error.context.json()).error;
  } catch {}
  return { status: error.context?.status ?? 0, error: msg };
}

function nextWeekday(dow) {
  const d = new Date();
  const diff = (dow + 7 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const adminUser = await createTestUser('admin');
  const client = await createTestUser('client');
  const anon = createClient(SUPABASE_URL, ANON_KEY, opts);
  const created = { users: [adminUser.uid, client.uid], businessId: null, storagePaths: [] };

  try {
    const { error: mkErr } = await admin.rpc('set_platform_admin', { p_user_id: adminUser.uid, p_on: true });
    if (mkErr) throw mkErr;

    // ── Admin создаёт салон — он скрыт ──────────────────────────────────
    const ownerEmail = `verify-onb-owner-${stamp}@bookspot.dev`;
    const cb = await callFn(adminUser.client, {
      action: 'create_business_with_owner',
      business: { name: 'Verify Onboarding Salon', categoryId: 'barber', city: 'Баку', paidUntil: null },
      owner: { name: 'Тест Владелец', email: ownerEmail },
    });
    if (cb.status !== 200) throw new Error(`не удалось создать салон: ${cb.status} ${cb.error}`);
    const bid = (created.businessId = cb.data.businessId);
    const owner = await signIn(ownerEmail, cb.data.password);
    created.users.push(owner.uid);

    const { data: guest0 } = await anon.from('businesses').select('id').eq('id', bid);
    check('новый салон не виден гостю', guest0?.length === 0, JSON.stringify(guest0));
    const { data: ownSalon } = await owner.client.from('businesses').select('published_at').eq('id', bid).maybeSingle();
    check('владелец видит свой неопубликованный салон', !!ownSalon && ownSalon.published_at === null, JSON.stringify(ownSalon));
    const { data: adminList } = await adminUser.client.rpc('admin_list_businesses');
    const inList = adminList?.find((b) => b.id === bid);
    check('admin видит салон в списке с published_at = null', !!inList && inList.published_at === null);

    // ── Пустой салон опубликовать нельзя ───────────────────────────────
    const st0 = await owner.client.rpc('business_setup_status', { p_business_id: bid });
    const allFalse = st0.data && ['description', 'photos', 'masters', 'schedule', 'services'].every((k) => st0.data[k] === false);
    check('чек-лист пустого салона: все пять пунктов не выполнены', !st0.error && allFalse, JSON.stringify(st0.data ?? st0.error));
    const p0 = await owner.client.rpc('publish_business', { p_business_id: bid });
    const msg0 = p0.error?.message ?? '';
    check(
      'publish_business на пустом салоне — ошибка со всеми пунктами',
      ['описание', 'фото', 'мастера', 'расписание', 'услуги'].every((w) => msg0.includes(w)),
      msg0
    );
    const direct = await owner.client.from('businesses').update({ published_at: new Date().toISOString() }).eq('id', bid);
    check('владелец не может проставить published_at напрямую', !!direct.error, direct.error?.message);
    const stOther = await client.client.rpc('business_setup_status', { p_business_id: bid });
    check('чужой не видит чек-лист салона', !!stOther.error, stOther.error?.message);

    const status = async () => (await owner.client.rpc('business_setup_status', { p_business_id: bid })).data;

    // ── 1. Описание ─────────────────────────────────────────────────────
    await owner.client.from('businesses').update({ description: 'Коротко' }).eq('id', bid);
    check('описание короче 30 символов не засчитано', (await status()).description === false);
    await owner.client.from('businesses').update({ description: 'Уютный барбершоп в центре Баку: стрижки, бороды, укладки.' }).eq('id', bid);
    check('описание от 30 символов засчитано', (await status()).description === true);

    // ── 2. Фото: storage + галерея, обложка, лимит 5 ───────────────────
    const path = `business/${bid}/gallery/verify-${stamp}.png`;
    const up = await owner.client.storage.from('photos').upload(path, PNG_1PX, { contentType: 'image/png' });
    check('владелец загружает файл в business/<id>/gallery/', !up.error, up.error?.message);
    if (!up.error) created.storagePaths.push(path);
    const url0 = owner.client.storage.from('photos').getPublicUrl(path).data.publicUrl;
    const ph0 = await owner.client.from('business_photos').insert({ business_id: bid, url: url0, storage_path: path, position: 0 }).select().single();
    check('владелец добавляет фото в галерею', !ph0.error, ph0.error?.message);
    const st2 = await status();
    check('фото засчитано, photos_count = 1', st2.photos === true && st2.photos_count === 1, JSON.stringify(st2));
    const { data: cover0 } = await admin.from('businesses').select('logo_url').eq('id', bid).single();
    check('обложка logo_url = первое фото', cover0.logo_url === url0, cover0.logo_url);

    const extra = [1, 2, 3, 4].map((i) => ({ business_id: bid, url: `${url0}?n=${i}`, position: i }));
    const ins4 = await owner.client.from('business_photos').insert(extra);
    check('можно довести галерею до 5 фото', !ins4.error, ins4.error?.message);
    const ins6 = await owner.client.from('business_photos').insert({ business_id: bid, url: `${url0}?n=6`, position: 9 });
    check('6-е фото отклонено', !!ins6.error?.message?.includes('5 фото'), ins6.error?.message);

    const { data: third } = await owner.client.from('business_photos').select('id, url').eq('business_id', bid).eq('position', 2).single();
    await owner.client.from('business_photos').update({ position: -1 }).eq('id', third.id);
    const { data: cover1 } = await admin.from('businesses').select('logo_url').eq('id', bid).single();
    check('«Сделать обложкой» меняет logo_url', cover1.logo_url === third.url, cover1.logo_url);

    const stranger = await client.client.from('business_photos').insert({ business_id: bid, url: 'https://evil.example/x.png' });
    check('чужой не может добавить фото в салон', !!stranger.error, stranger.error?.message);
    const { data: guestPhotos } = await anon.from('business_photos').select('id').eq('business_id', bid);
    check('фото неопубликованного салона не видны гостю', guestPhotos?.length === 0, JSON.stringify(guestPhotos));

    // ── 3–5. Мастер, расписание, услуга с мастером ─────────────────────
    const { data: master } = await owner.client.from('masters').insert({ business_id: bid, name: 'Мастер Onb' }).select().single();
    let st = await status();
    check('мастер засчитан, расписание ещё нет', st.masters === true && st.schedule === false, JSON.stringify(st));
    await owner.client.from('master_schedule').insert([1, 2, 3, 4, 5].map((dow) => ({ master_id: master.id, day_of_week: dow, start_min: 540, end_min: 1080 })));
    st = await status();
    check('расписание засчитано', st.schedule === true, JSON.stringify(st));
    const { data: svc } = await owner.client.from('services').insert({ business_id: bid, name: 'Стрижка Onb', price: 25, duration_min: 30 }).select().single();
    check('услуга без мастера не засчитана', (await status()).services === false);
    await owner.client.from('service_masters').insert({ service_id: svc.id, master_id: master.id });
    st = await status();
    check('услуга с мастером засчитана — все пять пунктов готовы', ['description', 'photos', 'masters', 'schedule', 'services'].every((k) => st[k] === true), JSON.stringify(st));

    // ── До публикации записаться нельзя, публикует только владелец ─────
    const monday = nextWeekday(1);
    const early = await client.client.rpc('create_booking', { p_business_id: bid, p_master_id: master.id, p_service_id: svc.id, p_date: monday, p_start: '10:00' });
    check('до публикации запись отклонена', !!early.error, early.error?.message);
    const pClient = await client.client.rpc('publish_business', { p_business_id: bid });
    check('клиент не может опубликовать чужой салон', !!pClient.error, pClient.error?.message);

    const staffEmail = `verify-onb-staff-${stamp}@bookspot.dev`;
    const cs = await callFn(owner.client, { action: 'create_staff', businessId: bid, masterId: master.id, email: staffEmail });
    if (cs.status === 200) {
      const staff = await signIn(staffEmail, cs.data.password);
      created.users.push(staff.uid);
      const pStaff = await staff.client.rpc('publish_business', { p_business_id: bid });
      check('мастер (staff) не может опубликовать салон', !!pStaff.error, pStaff.error?.message);
      await admin.from('masters').update({ user_id: null }).eq('id', master.id);
    } else {
      check('владелец выдаёт мастеру логин', false, `${cs.status} ${cs.error}`);
    }

    // ── Публикация ──────────────────────────────────────────────────────
    const pub = await owner.client.rpc('publish_business', { p_business_id: bid });
    check('владелец публикует готовый салон', !pub.error && !!pub.data, pub.error?.message);
    const pubAgain = await owner.client.rpc('publish_business', { p_business_id: bid });
    check('повторная публикация ничего не меняет', !pubAgain.error && pubAgain.data === pub.data, pubAgain.error?.message);
    const { data: guest1 } = await anon.from('businesses').select('id, description').eq('id', bid);
    check('после публикации салон виден гостю', guest1?.length === 1, JSON.stringify(guest1));
    const { data: guestPhotos1 } = await anon.from('business_photos').select('id').eq('business_id', bid);
    check('после публикации гость видит 5 фото', guestPhotos1?.length === 5, JSON.stringify(guestPhotos1?.length));

    const avail = await anon.rpc('get_availability', { p_master_id: master.id, p_service_id: svc.id, p_from: monday, p_days: 1 });
    check('get_availability отдаёт слоты', !avail.error && avail.data?.length > 0, avail.error?.message);
    const bk = await client.client.rpc('create_booking', { p_business_id: bid, p_master_id: master.id, p_service_id: svc.id, p_date: monday, p_start: '10:00' });
    check('после публикации клиент записывается', !bk.error && !!bk.data?.[0]?.id, bk.error?.message);

    // ── Старые салоны не пострадали ─────────────────────────────────────
    const { data: nizami } = await anon.from('businesses').select('id, published_at').eq('name', 'Atelier Nizami');
    check('Atelier Nizami по-прежнему виден гостю', nizami?.length === 1 && !!nizami[0].published_at, JSON.stringify(nizami));

    console.log(failed === 0 ? '\nВсе проверки пройдены.' : `\n${failed} проверок провалено.`);
  } finally {
    if (created.storagePaths.length) await admin.storage.from('photos').remove(created.storagePaths);
    if (created.businessId) {
      const { data: bks } = await admin.from('bookings').select('id').eq('business_id', created.businessId);
      for (const b of bks || []) await admin.from('notification_outbox').delete().eq('booking_id', b.id);
      await admin.from('bookings').delete().eq('business_id', created.businessId);
      await admin.from('business_members').delete().eq('business_id', created.businessId);
      await admin.rpc('admin_unlink_business', { p_business_id: created.businessId });
      await admin.from('masters').update({ user_id: null }).eq('business_id', created.businessId);
      await admin.from('businesses').delete().eq('id', created.businessId);
    }
    for (const uid of created.users) await admin.auth.admin.deleteUser(uid);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Проверка упала:', e.message || e);
  process.exit(1);
});
