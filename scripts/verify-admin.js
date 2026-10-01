// Проверка ролей из 0022 + Edge Function manage-accounts на живой базе:
// admin создаёт салон с владельцем, владелец выдаёт доступ мастеру, мастер
// видит только свои брони и ничего не может менять, подписка скрывает салон.
// Все тестовые пользователи и данные удаляются в finally.
//
// Нужны задеплоенные миграции 0021/0022 и функция manage-accounts.
// Запуск: cd scripts && npm run verify-admin
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
  const email = `verify-admin-${label}-${stamp}@bookspot.dev`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true, user_metadata: { name: label } });
  if (error) throw error;
  return signIn(email, 'Test1234!').then((s) => ({ ...s, email }));
}

// Вызов функции от имени пользователя; на не-2xx возвращает { status, error }.
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
  const created = { users: [adminUser.uid, client.uid], businessId: null, bookingIds: [] };

  try {
    const { error: mkErr } = await admin.rpc('set_platform_admin', { p_user_id: adminUser.uid, p_on: true });
    if (mkErr) throw mkErr;

    // ── Не-admin не может ничего из админки ─────────────────────────────
    const r1 = await callFn(client.client, { action: 'create_business_with_owner', business: {}, owner: {} });
    check('клиент не может создать салон через функцию', r1.status === 403, `${r1.status} ${r1.error}`);
    const r2 = await client.client.rpc('admin_list_businesses');
    check('клиент не видит список салонов admin', !!r2.error, r2.error?.message);
    const r3 = await client.client.rpc('create_business', { p_name: 'Самозванец', p_category_id: 'barber', p_city: 'Баку' });
    check('самостоятельная регистрация салона закрыта', !!r3.error, r3.error?.message);

    // ── Серверные функции недоступны из приложения (0030) ───────────────
    // До 0030 их мог вызвать любой: revoke from public не снимал EXECUTE,
    // выданный Supabase ролям anon/authenticated напрямую.
    const selfAdmin = await client.client.rpc('set_platform_admin', { p_user_id: client.uid, p_on: true });
    const { data: stillClient } = await admin.from('profiles').select('role').eq('id', client.uid).single();
    check('клиент не может назначить себя admin (set_platform_admin)', !!selfAdmin.error && stillClient.role === 'client', selfAdmin.error?.message || stillClient.role);
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, opts);
    const anonAdmin = await anonClient.rpc('set_platform_admin', { p_user_id: client.uid, p_on: true });
    check('гость не может вызвать set_platform_admin', !!anonAdmin.error, anonAdmin.error?.message);
    const fakeBiz = await client.client.rpc('admin_create_business', {
      p_owner_id: client.uid, p_name: 'Взлом', p_category_id: 'barber', p_city: 'Баку',
      p_district: null, p_address: null, p_phone: null, p_paid_until: null,
    });
    check('клиент не может вызвать admin_create_business', !!fakeBiz.error, fakeBiz.error?.message);
    const fakeLink = await client.client.rpc('link_staff', { p_business_id: client.uid, p_user_id: client.uid, p_master_id: client.uid });
    check('клиент не может вызвать link_staff', !!fakeLink.error, fakeLink.error?.message);

    // ── Admin создаёт салон с владельцем ────────────────────────────────
    const ownerEmail = `verify-admin-owner-${stamp}@bookspot.dev`;
    const cb = await callFn(adminUser.client, {
      action: 'create_business_with_owner',
      business: { name: 'Verify Admin Salon', categoryId: 'barber', city: 'Баку', paidUntil: null },
      owner: { name: 'Тест Владелец', email: ownerEmail },
    });
    check('admin создаёт салон и аккаунт владельца', cb.status === 200 && !!cb.data?.password, `${cb.status} ${cb.error}`);
    if (cb.status !== 200) throw new Error('дальше без салона нельзя');
    created.businessId = cb.data.businessId;
    // Новый салон скрыт, пока не пройдён чек-лист (0024). Тестовым фикстурам
    // он не нужен — публикуем сразу через service_role.
    await admin.from('businesses').update({ published_at: new Date().toISOString() }).eq('id', created.businessId);

    const owner = await signIn(ownerEmail, cb.data.password);
    created.users.push(owner.uid);
    const { data: ownerProfile } = await admin.from('profiles').select('role, business_id, must_change_password').eq('id', owner.uid).single();
    check(
      'владелец входит по временному паролю, роль и флаг смены пароля верные',
      ownerProfile.role === 'business_owner' && ownerProfile.business_id === created.businessId && ownerProfile.must_change_password === true,
      JSON.stringify(ownerProfile)
    );

    // ── Владелец настраивает салон: услуга, два мастера, расписание ─────
    const bid = created.businessId;
    const { data: svc } = await owner.client.from('services').insert({ business_id: bid, name: 'Verify', price: 20, duration_min: 30 }).select().single();
    const { data: mA } = await owner.client.from('masters').insert({ business_id: bid, name: 'Мастер A' }).select().single();
    const { data: mB } = await owner.client.from('masters').insert({ business_id: bid, name: 'Мастер B' }).select().single();
    await owner.client.from('service_masters').insert([{ service_id: svc.id, master_id: mA.id }, { service_id: svc.id, master_id: mB.id }]);
    const sched = (m) => [1, 2, 3, 4, 5].map((dow) => ({ master_id: m, day_of_week: dow, start_min: 540, end_min: 1080 }));
    await owner.client.from('master_schedule').insert([...sched(mA.id), ...sched(mB.id)]);
    check('владелец создаёт услугу, мастеров и расписание', !!svc && !!mA && !!mB);

    // ── Владелец выдаёт доступ мастеру A ────────────────────────────────
    const staffEmail = `verify-admin-staff-${stamp}@bookspot.dev`;
    const cs = await callFn(owner.client, { action: 'create_staff', businessId: bid, masterId: mA.id, email: staffEmail });
    check('владелец выдаёт мастеру логин', cs.status === 200 && !!cs.data?.password, `${cs.status} ${cs.error}`);
    const staff = await signIn(staffEmail, cs.data.password);
    created.users.push(staff.uid);
    const { data: staffProfile } = await admin.from('profiles').select('role, business_id').eq('id', staff.uid).single();
    const { data: mAafter } = await admin.from('masters').select('user_id').eq('id', mA.id).single();
    check('мастер привязан: роль staff, masters.user_id', staffProfile.role === 'staff' && mAafter.user_id === staff.uid, JSON.stringify(staffProfile));

    const cs2 = await callFn(client.client, { action: 'create_staff', businessId: bid, masterId: mB.id, email: `x-${stamp}@bookspot.dev` });
    check('чужой не может выдать доступ мастеру', cs2.status === 403, `${cs2.status} ${cs2.error}`);

    // ── Брони: клиент к A и к B ────────────────────────────────────────
    const monday = nextWeekday(1);
    const bA = await client.client.rpc('create_booking', { p_business_id: bid, p_master_id: mA.id, p_service_id: svc.id, p_date: monday, p_start: '10:00' });
    const bB = await client.client.rpc('create_booking', { p_business_id: bid, p_master_id: mB.id, p_service_id: svc.id, p_date: monday, p_start: '11:00' });
    check('клиент записывается к обоим мастерам', !bA.error && !bB.error, bA.error?.message || bB.error?.message);
    const idA = bA.data?.[0]?.id, idB = bB.data?.[0]?.id;
    created.bookingIds.push(idA, idB);

    const { data: staffSees } = await staff.client.from('bookings').select('id').eq('business_id', bid);
    check('мастер видит только свою бронь', staffSees?.length === 1 && staffSees[0].id === idA, JSON.stringify(staffSees));
    const { data: ownerSees } = await owner.client.from('bookings').select('id').eq('business_id', bid);
    check('владелец видит все брони салона', ownerSees?.length === 2, JSON.stringify(ownerSees));

    // ── Мастер ничего не меняет ─────────────────────────────────────────
    const s1 = await staff.client.from('services').insert({ business_id: bid, name: 'Взлом', price: 1, duration_min: 30 });
    check('мастер не может добавить услугу', !!s1.error, s1.error?.message);
    const s2 = await staff.client.from('master_schedule').insert({ master_id: mA.id, day_of_week: 6, start_min: 540, end_min: 600 });
    check('мастер не может менять расписание', !!s2.error, s2.error?.message);
    await staff.client.from('businesses').update({ name: 'Переименовано мастером' }).eq('id', bid);
    const { data: bizName } = await admin.from('businesses').select('name').eq('id', bid).single();
    check('мастер не может переименовать салон', bizName.name === 'Verify Admin Salon', bizName.name);
    const s3 = await staff.client.rpc('create_manual_booking', { p_business_id: bid, p_master_id: mB.id, p_service_id: svc.id, p_date: monday, p_start: '14:00', p_client_name: 'X' });
    check('мастер не может записать клиента к чужому мастеру', !!s3.error, s3.error?.message);

    // ── Владелец не продлевает подписку сам ─────────────────────────────
    const o1 = await owner.client.from('businesses').update({ paid_until: '2099-01-01' }).eq('id', bid);
    check('владелец не может сам продлить подписку', !!o1.error, o1.error?.message);

    // ── Push «Новая запись»: владельцу и нужному мастеру ────────────────
    const { data: outA } = await admin.from('notification_outbox').select('user_id').eq('booking_id', idA).eq('type', 'new_booking_business');
    const { data: outB } = await admin.from('notification_outbox').select('user_id').eq('booking_id', idB).eq('type', 'new_booking_business');
    const setA = new Set((outA || []).map((r) => r.user_id));
    check('«Новая запись» к мастеру A — владельцу и мастеру A', setA.size === 2 && setA.has(owner.uid) && setA.has(staff.uid), [...setA].join(','));
    check('«Новая запись» к мастеру B — только владельцу', outB?.length === 1 && outB[0].user_id === owner.uid, JSON.stringify(outB));

    // ── Подписка истекла: салон скрыт, новые записи не принимаются ──────
    const yesterday = new Date(Date.now() + 4 * 3600000 - 86400000).toISOString().slice(0, 10);
    const sub = await adminUser.client.rpc('admin_set_subscription', { p_business_id: bid, p_paid_until: yesterday });
    check('admin меняет дату подписки', !sub.error, sub.error?.message);
    const { data: guestSees } = await anon.from('businesses').select('id').eq('id', bid);
    check('салон с истёкшей подпиской скрыт из каталога', guestSees?.length === 0, JSON.stringify(guestSees));
    const late = await client.client.rpc('create_booking', { p_business_id: bid, p_master_id: mA.id, p_service_id: svc.id, p_date: monday, p_start: '15:00' });
    check('новая запись в салон с истёкшей подпиской отклонена', !!late.error?.message?.includes('не принимает'), late.error?.message);
    const { data: stillThere } = await admin.from('bookings').select('id').eq('id', idA).maybeSingle();
    check('уже созданные записи сохранились', !!stillThere);
    const { data: ownerOwn } = await owner.client.from('businesses').select('paid_until').eq('id', bid).maybeSingle();
    check('владелец видит свой салон после окончания подписки', ownerOwn?.paid_until === yesterday, JSON.stringify(ownerOwn));

    // ── Сброс пароля и отзыв доступа ───────────────────────────────────
    const rp = await callFn(owner.client, { action: 'reset_password', userId: staff.uid });
    check('владелец сбрасывает пароль мастеру', rp.status === 200 && !!rp.data?.password, `${rp.status} ${rp.error}`);
    const rp2 = await callFn(client.client, { action: 'reset_password', userId: owner.uid });
    check('клиент не может сбросить чужой пароль', rp2.status === 403, `${rp2.status} ${rp2.error}`);
    const rs = await callFn(owner.client, { action: 'remove_staff', masterId: mA.id });
    const { data: mAgone } = await admin.from('masters').select('user_id').eq('id', mA.id).single();
    const { data: staffGone } = await admin.auth.admin.getUserById(staff.uid);
    check('владелец забирает доступ — аккаунт мастера удалён, мастер остался', rs.status === 200 && mAgone.user_id === null && !staffGone?.user, `${rs.status} ${rs.error}`);
    if (!staffGone?.user) created.users = created.users.filter((u) => u !== staff.uid);

    console.log(failed === 0 ? '\nВсе проверки пройдены.' : `\n${failed} проверок провалено.`);
  } finally {
    for (const id of created.bookingIds.filter(Boolean)) {
      await admin.from('notification_outbox').delete().eq('booking_id', id);
      await admin.from('bookings').delete().eq('id', id);
    }
    if (created.businessId) {
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
