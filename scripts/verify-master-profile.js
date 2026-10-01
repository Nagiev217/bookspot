// Проверка 0026 на живой базе: мастер со своим логином меняет только своё
// фото и «о себе», клиент видит профиль мастера и его услуги. Все тестовые
// пользователи и данные удаляются в finally.
//
// Запуск: cd scripts && npm run verify-master-profile
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
  const email = `verify-mp-${label}-${stamp}@bookspot.dev`;
  const { error } = await admin.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true, user_metadata: { name: label } });
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

async function main() {
  const adminUser = await createTestUser('admin');
  const client = await createTestUser('client');
  const anon = createClient(SUPABASE_URL, ANON_KEY, opts);
  const created = { users: [adminUser.uid, client.uid], businessId: null, storagePaths: [] };

  try {
    const { error: mkErr } = await admin.rpc('set_platform_admin', { p_user_id: adminUser.uid, p_on: true });
    if (mkErr) throw mkErr;

    const ownerEmail = `verify-mp-owner-${stamp}@bookspot.dev`;
    const cb = await callFn(adminUser.client, {
      action: 'create_business_with_owner',
      business: { name: 'Verify Master Profile Salon', categoryId: 'barber', city: 'Баку', paidUntil: null },
      owner: { name: 'Тест Владелец', email: ownerEmail },
    });
    if (cb.status !== 200) throw new Error(`не удалось создать салон: ${cb.status} ${cb.error}`);
    const bid = (created.businessId = cb.data.businessId);
    const owner = await signIn(ownerEmail, cb.data.password);
    created.users.push(owner.uid);

    const { data: mA } = await owner.client.from('masters').insert({ business_id: bid, name: 'Мастер A' }).select().single();
    const { data: mB } = await owner.client.from('masters').insert({ business_id: bid, name: 'Мастер B' }).select().single();
    const { data: svc } = await owner.client.from('services').insert({ business_id: bid, name: 'Стрижка MP', price: 30, duration_min: 45 }).select().single();
    const { data: svcOff } = await owner.client.from('services').insert({ business_id: bid, name: 'Старая услуга', price: 10, duration_min: 30, active: false }).select().single();
    await owner.client.from('service_masters').insert([{ service_id: svc.id, master_id: mA.id }, { service_id: svcOff.id, master_id: mA.id }]);

    // ── Владелец пишет bio напрямую ───────────────────────────────────
    const ob = await owner.client.from('masters').update({ bio: 'Барбер с 5-летним стажем' }).eq('id', mB.id);
    check('владелец задаёт «о себе» мастеру', !ob.error, ob.error?.message);

    const ownerPath = `master/${mB.id}/photo-${stamp}.png`;
    const upOwner = await owner.client.storage.from('photos').upload(ownerPath, PNG_1PX, { contentType: 'image/png', upsert: true });
    check('владелец загружает фото мастеру (баг из 0012, исправлен в 0027)', !upOwner.error, upOwner.error?.message);
    if (!upOwner.error) created.storagePaths.push(ownerPath);

    // ── Мастер со своим логином ───────────────────────────────────────
    const staffEmail = `verify-mp-staff-${stamp}@bookspot.dev`;
    const cs = await callFn(owner.client, { action: 'create_staff', businessId: bid, masterId: mA.id, email: staffEmail });
    if (cs.status !== 200) throw new Error(`не удалось выдать доступ мастеру: ${cs.status} ${cs.error}`);
    const staff = await signIn(staffEmail, cs.data.password);
    created.users.push(staff.uid);

    const r1 = await staff.client.rpc('update_my_master_profile', { p_bio: '  Колорист, 7 лет опыта  ', p_photo_url: null });
    const { data: aAfter } = await anon.from('masters').select('bio, photo_url').eq('id', mA.id).single();
    check('мастер сохраняет «о себе», пробелы обрезаны, клиент это видит', !r1.error && aAfter.bio === 'Колорист, 7 лет опыта', r1.error?.message || aAfter.bio);

    const path = `master/${mA.id}/photo-${stamp}.png`;
    const up = await staff.client.storage.from('photos').upload(path, PNG_1PX, { contentType: 'image/png', upsert: true });
    check('мастер загружает фото в свою папку', !up.error, up.error?.message);
    if (!up.error) created.storagePaths.push(path);
    const url = staff.client.storage.from('photos').getPublicUrl(path).data.publicUrl;
    const r2 = await staff.client.rpc('update_my_master_profile', { p_bio: 'Колорист, 7 лет опыта', p_photo_url: url });
    const { data: aPhoto } = await anon.from('masters').select('photo_url, bio').eq('id', mA.id).single();
    check('мастер ставит себе аватар, bio сохранилось', !r2.error && aPhoto.photo_url === url && aPhoto.bio === 'Колорист, 7 лет опыта', r2.error?.message);

    const otherPath = `master/${mB.id}/hack-${stamp}.png`;
    const upB = await staff.client.storage.from('photos').upload(otherPath, PNG_1PX, { contentType: 'image/png' });
    check('мастер не может загрузить фото в папку другого мастера', !!upB.error, upB.error?.message);
    if (!upB.error) created.storagePaths.push(otherPath);

    const r3 = await staff.client.rpc('update_my_master_profile', { p_bio: 'x', p_photo_url: 'https://evil.example/x.png' });
    check('чужая ссылка на фото отклонена', !!r3.error, r3.error?.message);
    const r4 = await staff.client.rpc('update_my_master_profile', { p_bio: 'a'.repeat(501), p_photo_url: null });
    check('«о себе» длиннее 500 символов отклонено', !!r4.error, r4.error?.message);

    await staff.client.from('masters').update({ name: 'Переименован', active: false }).eq('id', mA.id);
    const { data: aName } = await admin.from('masters').select('name, active').eq('id', mA.id).single();
    check('мастер не может сам менять имя и активность', aName.name === 'Мастер A' && aName.active === true, JSON.stringify(aName));
    await staff.client.from('masters').update({ bio: 'чужое' }).eq('id', mB.id);
    const { data: bBio } = await admin.from('masters').select('bio').eq('id', mB.id).single();
    check('мастер не может менять профиль другого мастера', bBio.bio === 'Барбер с 5-летним стажем', bBio.bio);

    const r5 = await client.client.rpc('update_my_master_profile', { p_bio: 'я не мастер', p_photo_url: null });
    check('обычный клиент не может вызвать update_my_master_profile', !!r5.error, r5.error?.message);

    // ── Страница мастера глазами клиента ─────────────────────────────
    const { data: svcRows, error: svcErr } = await anon
      .from('service_masters')
      .select('service:services!inner(id, name, active)')
      .eq('master_id', mA.id)
      .eq('service.active', true);
    const names = (svcRows || []).map((r) => r.service.name);
    check('клиент видит только активные услуги мастера', !svcErr && names.length === 1 && names[0] === 'Стрижка MP', svcErr?.message || names.join(','));

    console.log(failed === 0 ? '\nВсе проверки пройдены.' : `\n${failed} проверок провалено.`);
  } finally {
    if (created.storagePaths.length) await admin.storage.from('photos').remove(created.storagePaths);
    if (created.businessId) {
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
