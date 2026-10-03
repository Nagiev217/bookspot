// Дыры из аудита (0036) на живой базе: каждая атака должна быть отбита, а
// штатные пути — работать. Тестовые данные удаляются в finally.
//
// Запуск: cd scripts && npm run verify-security
'use strict';
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
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
  const c = createClient(URL, ANON, opts);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { uid: data.user.id, client: c };
}
async function user(label) {
  const email = `verify-sec-${label}-${stamp}@bookspot.dev`;
  const { error } = await admin.auth.admin.createUser({ email, password: 'Test1234!', email_confirm: true, user_metadata: { name: label } });
  if (error) throw error;
  return { ...(await signIn(email, 'Test1234!')), email };
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

(async () => {
  const adminUser = await user('admin');
  const victim = await user('victim');
  const anon = createClient(URL, ANON, opts);
  const created = { users: [adminUser.uid, victim.uid], businessId: null };
  try {
    await admin.rpc('set_platform_admin', { p_user_id: adminUser.uid, p_on: true });
    const ownerEmail = `verify-sec-owner-${stamp}@bookspot.dev`;
    const cb = await callFn(adminUser.client, {
      action: 'create_business_with_owner',
      business: { name: 'Verify Security Salon', categoryId: 'barber', city: 'Bakı', paidUntil: null },
      owner: { name: 'Owner', email: ownerEmail },
    });
    if (cb.status !== 200) throw new Error(`создание салона: ${cb.status} ${cb.error}`);
    const bid = (created.businessId = cb.data.businessId);

    // ── 4. Временный пароль ────────────────────────────────────────────
    let owner = await signIn(ownerEmail, cb.data.password);
    created.users.push(owner.uid);
    const direct = await owner.client.from('profiles').update({ must_change_password: false }).eq('id', owner.uid);
    check('нельзя снять «смените пароль» прямым UPDATE', !!direct.error, direct.error?.message);
    const rpcEarly = await owner.client.rpc('clear_must_change_password');
    check('нельзя снять флаг RPC, не сменив временный пароль', !!rpcEarly.error, rpcEarly.error?.message);
    await owner.client.auth.updateUser({ password: 'Owner-New-12345' });
    const rpcOk = await owner.client.rpc('clear_must_change_password');
    const { data: flag } = await admin.from('profiles').select('must_change_password').eq('id', owner.uid).single();
    check('после смены пароля флаг снимается', !rpcOk.error && flag.must_change_password === false, rpcOk.error?.message);

    const rp = await callFn(adminUser.client, { action: 'reset_password', userId: owner.uid });
    owner = await signIn(ownerEmail, rp.data.password);
    const rpcAfterReset = await owner.client.rpc('clear_must_change_password');
    check('после сброса пароля флаг снова не снять без смены', !!rpcAfterReset.error, rpcAfterReset.error?.message);
    await owner.client.auth.updateUser({ password: 'Owner-New-67890' });
    await owner.client.rpc('clear_must_change_password');

    // ── 1. Захват аккаунта в мастера ───────────────────────────────────
    const { data: m } = await owner.client.from('masters').insert({ business_id: bid, name: 'Master' }).select().single();
    const hijack = await owner.client.from('masters').update({ user_id: victim.uid }).eq('id', m.id);
    const { data: mAfter } = await admin.from('masters').select('user_id').eq('id', m.id).single();
    check('владелец не может привязать чужой аккаунт к мастеру', !!hijack.error && mAfter.user_id === null, hijack.error?.message);
    const insHijack = await owner.client.from('masters').insert({ business_id: bid, name: 'Ghost', user_id: victim.uid });
    check('нельзя создать мастера сразу с чужим логином', !!insHijack.error, insHijack.error?.message);
    const prof = await victim.client.rpc('update_my_master_profile', { p_bio: 'x', p_photo_url: null, p_specialty: '', p_experience_years: null });
    check('посторонний не получил права мастера', !!prof.error, prof.error?.message);

    const staffEmail = `verify-sec-staff-${stamp}@bookspot.dev`;
    const cs = await callFn(owner.client, { action: 'create_staff', businessId: bid, masterId: m.id, email: staffEmail });
    check('штатная выдача доступа мастеру работает', cs.status === 200, `${cs.status} ${cs.error}`);
    const staff = await signIn(staffEmail, cs.data.password);
    created.users.push(staff.uid);
    const rename = await owner.client.from('masters').update({ name: 'Master 2', bio: 'ok' }).eq('id', m.id);
    check('владелец по-прежнему правит имя и описание мастера', !rename.error, rename.error?.message);
    const unlink = await owner.client.from('masters').update({ user_id: null }).eq('id', m.id);
    check('владелец не может отвязать логин в обход «Забрать доступ»', !!unlink.error, unlink.error?.message);
    const rs = await callFn(owner.client, { action: 'remove_staff', masterId: m.id });
    check('«Забрать доступ» работает', rs.status === 200, `${rs.status} ${rs.error}`);
    created.users = created.users.filter((u) => u !== staff.uid);

    // ── 2. Рейтинг ─────────────────────────────────────────────────────
    const fake = await owner.client.from('businesses').update({ rating_avg: 5, review_count: 9999 }).eq('id', bid);
    const { data: biz } = await admin.from('businesses').select('rating_avg, review_count').eq('id', bid).single();
    check('владелец не может накрутить рейтинг', !!fake.error && biz.review_count === 0, fake.error?.message || JSON.stringify(biz));
    const desc = await owner.client.from('businesses').update({ description: 'Обычное обновление описания салона для проверки.' }).eq('id', bid);
    check('обычные поля салона владелец правит как раньше', !desc.error, desc.error?.message);
    const badStep = await owner.client.from('businesses').update({ slot_step_min: 0 }).eq('id', bid);
    check('шаг слота 0 отклонён (зависание подбора времени)', !!badStep.error, badStep.error?.message);

    // ── 3. client_id отзывов ───────────────────────────────────────────
    const leak = await anon.from('reviews').select('client_id').limit(1);
    check('аноним не видит client_id отзывов', !!leak.error, leak.error?.message);
    const ok = await anon.from('reviews').select('id, client_name, rating, comment').limit(1);
    check('публичные поля отзывов по-прежнему видны', !ok.error, ok.error?.message);
    const leakAuth = await victim.client.from('reviews').select('client_id').limit(1);
    check('вошедший пользователь тоже не видит client_id', !!leakAuth.error, leakAuth.error?.message);

    console.log(failed === 0 ? '\nВсе проверки пройдены.' : `\n${failed} проверок провалено.`);
  } catch (e) {
    console.error('Проверка упала:', e.message || e);
    failed += 1;
  } finally {
    if (created.businessId) {
      await admin.from('bookings').delete().eq('business_id', created.businessId);
      await admin.from('business_members').delete().eq('business_id', created.businessId);
      await admin.rpc('admin_unlink_business', { p_business_id: created.businessId });
      await admin.from('masters').update({ user_id: null }).eq('business_id', created.businessId);
      await admin.from('businesses').delete().eq('id', created.businessId);
    }
    for (const u of created.users) await admin.auth.admin.deleteUser(u);
  }
  process.exit(failed === 0 ? 0 : 1);
})();
