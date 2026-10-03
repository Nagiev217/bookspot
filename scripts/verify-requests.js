// Проверка 0029 на живой базе: запись клиента — заявка, которую принимает
// мастер (или владелец, если у мастера нет логина); мастер может отклонить
// или предложить другое время, клиент — принять или отказаться; заявка без
// ответа отменяется. Все тестовые пользователи и данные удаляются в finally.
//
// Запуск: cd scripts && npm run verify-requests
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

async function createTestUser(label) {
  const email = `verify-req-${label}-${stamp}@bookspot.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Test1234!',
    email_confirm: true,
    user_metadata: { name: `Тест ${label}` },
  });
  if (error) throw error;
  const client = createClient(SUPABASE_URL, ANON_KEY, opts);
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: 'Test1234!' });
  if (sErr) throw sErr;
  return { uid: data.user.id, client };
}

function nextWeekday(dow) {
  const d = new Date();
  const diff = (dow + 7 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// Время брони в Баку, "HH:MM".
function bakuHHMM(iso) {
  const d = new Date(new Date(iso).getTime() + 4 * 3600000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

async function outbox(bookingId) {
  const { data } = await admin.from('notification_outbox').select('user_id, type, title').eq('booking_id', bookingId);
  return data || [];
}

async function status(bookingId) {
  const { data } = await admin.from('bookings').select('status, cancel_reason, starts_at, requested_starts_at, expires_at').eq('id', bookingId).single();
  return data;
}

async function main() {
  const owner = await createTestUser('owner');
  const staff = await createTestUser('staff');
  const client = await createTestUser('client');
  const client2 = await createTestUser('client2');
  const created = { users: [owner.uid, staff.uid, client.uid, client2.uid], businessId: null };

  try {
    // ── Салон: мастер A с логином, мастер B без логина ─────────────────
    const { data: bid, error: bizErr } = await admin.rpc('admin_create_business', {
      p_owner_id: owner.uid,
      p_name: 'Verify Requests Salon',
      p_category_id: 'barber',
      p_city: 'Баку',
      p_district: null,
      p_address: null,
      p_phone: null,
      p_paid_until: null,
    });
    if (bizErr) throw bizErr;
    created.businessId = bid;
    await admin.from('businesses').update({ published_at: new Date().toISOString() }).eq('id', bid);

    const { data: svc } = await owner.client.from('services').insert({ business_id: bid, name: 'Стрижка REQ', price: 30, duration_min: 60 }).select().single();
    const { data: mA } = await owner.client.from('masters').insert({ business_id: bid, name: 'Мастер A' }).select().single();
    const { data: mB } = await owner.client.from('masters').insert({ business_id: bid, name: 'Мастер B' }).select().single();
    await owner.client.from('service_masters').insert([{ service_id: svc.id, master_id: mA.id }, { service_id: svc.id, master_id: mB.id }]);
    const week = (m) => [1, 2, 3, 4, 5].map((dow) => ({ master_id: m, day_of_week: dow, start_min: 540, end_min: 1080 }));
    await owner.client.from('master_schedule').insert([...week(mA.id), ...week(mB.id)]);
    const { error: linkErr } = await admin.rpc('link_staff', { p_business_id: bid, p_user_id: staff.uid, p_master_id: mA.id });
    if (linkErr) throw linkErr;

    const monday = nextWeekday(1);
    const book = (who, master, start) =>
      who.client.rpc('create_booking', { p_business_id: bid, p_master_id: master, p_service_id: svc.id, p_date: monday, p_start: start });
    const slots = async (master) => {
      const { data } = await admin.rpc('get_availability', { p_master_id: master, p_service_id: svc.id, p_from: monday, p_days: 1 });
      return (data || []).map((r) => r.slot_time);
    };

    // ── 1. Запись — это заявка ─────────────────────────────────────────
    const r1 = await book(client, mA.id, '10:00');
    const b1 = r1.data?.[0]?.id;
    const s1 = b1 && (await status(b1));
    check('запись клиента создаётся как заявка (pending)', !r1.error && s1?.status === 'pending', r1.error?.message || s1?.status);
    // Срок ответа — 2 дневных часа (0033): днём ровно 2 ч, ночью отсчёт
    // начинается с 09:00 по Баку.
    const expMin = s1 ? (new Date(s1.expires_at) - Date.now()) / 60000 : 0;
    const bakuHour = new Date(Date.now() + 4 * 3600e3).getUTCHours();
    const daytime = bakuHour >= 9 && bakuHour < 20;
    check(
      'срок ответа — 2 дневных часа',
      daytime ? expMin > 115 && expMin <= 121 : expMin > 121 && expMin <= 14 * 60,
      `${expMin.toFixed(1)} мин, час в Баку ${bakuHour}`
    );

    // Минимальное время до записи (0033) и отсутствие прошедших слотов.
    const todayBaku = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
    const { data: todaySlots } = await admin.rpc('get_availability', { p_master_id: mA.id, p_service_id: svc.id, p_from: todayBaku, p_days: 1 });
    const minHM = new Date(Date.now() + 4 * 3600e3 + 3600e3).toISOString().slice(11, 16);
    check('сегодня нет прошедших слотов и слотов ближе часа', (todaySlots || []).every((r) => r.slot_time >= minHM), (todaySlots || []).slice(0, 3).map((r) => r.slot_time).join(','));
    const soon = new Date(Date.now() + 4 * 3600e3 + 20 * 60e3);
    const soonHM = `${String(soon.getUTCHours()).padStart(2, '0')}:${String(Math.floor(soon.getUTCMinutes() / 15) * 15).padStart(2, '0')}`;
    const tooSoon = await client.client.rpc('create_booking', { p_business_id: bid, p_master_id: mA.id, p_service_id: svc.id, p_date: soon.toISOString().slice(0, 10), p_start: soonHM });
    check('запись меньше чем за час отклонена', !!tooSoon.error, tooSoon.error?.message);

    const o1 = await outbox(b1);
    const staffNotes = o1.filter((n) => n.type === 'new_booking_business');
    check(
      '«Новая заявка» ушла владельцу и мастеру A',
      staffNotes.length === 2 && staffNotes.every((n) => n.title === 'Новая заявка') && staffNotes.some((n) => n.user_id === staff.uid),
      JSON.stringify(o1)
    );
    check('клиенту не пришло «подтверждена» и нет напоминания до ответа мастера', !o1.some((n) => n.user_id === client.uid), JSON.stringify(o1));

    const again = await book(client, mA.id, '10:00');
    check('повтор той же заявки возвращает её же', again.data?.[0]?.id === b1, again.error?.message);

    const steal = await book(client2, mA.id, '10:00');
    check('время заявки держится: другой клиент не может записаться', ['23P01', '22023'].includes(steal.error?.code), `${steal.error?.code} ${steal.error?.message}`);
    check('get_availability не предлагает время заявки', !(await slots(mA.id)).includes('10:00'));

    // ── 2. Кто может отвечать ──────────────────────────────────────────
    const byClient = await client.client.rpc('accept_booking', { p_booking_id: b1 });
    check('клиент не может сам принять свою заявку', byClient.error?.code === '42501', byClient.error?.message);

    const acc = await staff.client.rpc('accept_booking', { p_booking_id: b1 });
    const s1b = await status(b1);
    check('мастер A принимает заявку → confirmed', !acc.error && s1b.status === 'confirmed', acc.error?.message || s1b.status);
    const o1b = await outbox(b1);
    check(
      'клиент получил «Запись подтверждена» и напоминание',
      o1b.some((n) => n.user_id === client.uid && n.type === 'booking_confirmed') && o1b.some((n) => n.user_id === client.uid && n.type === 'booking_reminder'),
      JSON.stringify(o1b.filter((n) => n.user_id === client.uid))
    );

    // ── 3. Мастер без логина: отвечает владелец ────────────────────────
    const r2 = await book(client, mB.id, '10:00');
    const b2 = r2.data?.[0]?.id;
    const staffOnB = await staff.client.rpc('accept_booking', { p_booking_id: b2 });
    check('мастер A не может ответить на заявку к мастеру B', !!staffOnB.error, staffOnB.error?.message);
    const dec = await owner.client.rpc('decline_booking', { p_booking_id: b2 });
    const s2 = await status(b2);
    check('владелец отклоняет заявку к мастеру без логина', !dec.error && s2.status === 'cancelled' && s2.cancel_reason === 'declined', dec.error?.message || JSON.stringify(s2));
    check('клиенту ушло «Мастер не сможет принять»', (await outbox(b2)).some((n) => n.user_id === client.uid && n.type === 'booking_declined'));
    check('после отказа время мастера B снова свободно', (await slots(mB.id)).includes('10:00'));

    // ── 4. Другое время → клиент принимает ─────────────────────────────
    const r3 = await book(client, mA.id, '12:00');
    const b3 = r3.data?.[0]?.id;
    const prop = await staff.client.rpc('propose_booking_time', { p_booking_id: b3, p_date: monday, p_start: '15:00' });
    const s3 = await status(b3);
    check(
      'мастер предлагает 15:00 вместо 12:00 → proposed',
      !prop.error && s3.status === 'proposed' && bakuHHMM(s3.starts_at) === '15:00' && bakuHHMM(s3.requested_starts_at) === '12:00',
      prop.error?.message || JSON.stringify(s3)
    );
    check('клиенту ушло «Мастер предложил другое время»', (await outbox(b3)).some((n) => n.user_id === client.uid && n.type === 'booking_proposed'));
    const freeA = await slots(mA.id);
    check('исходное 12:00 освободилось, предложенное 15:00 держится', freeA.includes('12:00') && !freeA.includes('15:00'), freeA.join(','));

    const propBusy = await staff.client.rpc('propose_booking_time', { p_booking_id: b3, p_date: monday, p_start: '10:00' });
    check('повторно предложить время на proposed нельзя', !!propBusy.error, propBusy.error?.message);
    const accProposed = await staff.client.rpc('accept_booking', { p_booking_id: b3 });
    check('мастер не может сам «принять» своё предложение за клиента', !!accProposed.error, accProposed.error?.message);
    const otherClient = await client2.client.rpc('respond_to_proposal', { p_booking_id: b3, p_accept: true });
    check('чужой клиент не может ответить на предложение', otherClient.error?.code === '42501', otherClient.error?.message);

    const yes = await client.client.rpc('respond_to_proposal', { p_booking_id: b3, p_accept: true });
    const s3b = await status(b3);
    check('клиент принимает предложенное время → confirmed', !yes.error && s3b.status === 'confirmed', yes.error?.message || s3b.status);
    check('мастеру ушло «Клиент принял ваше время»', (await outbox(b3)).some((n) => n.user_id === staff.uid && n.type === 'proposal_answered'));

    // ── 5. Другое время → клиент отказывается ──────────────────────────
    const r4 = await book(client2, mA.id, '13:00');
    const b4 = r4.data?.[0]?.id;
    await staff.client.rpc('propose_booking_time', { p_booking_id: b4, p_date: monday, p_start: '16:00' });
    const no = await client2.client.rpc('respond_to_proposal', { p_booking_id: b4, p_accept: false });
    const s4 = await status(b4);
    check('клиент отказывается от предложенного времени', !no.error && s4.status === 'cancelled' && s4.cancel_reason === 'proposal_declined', no.error?.message || JSON.stringify(s4));
    check('отказ освобождает предложенное время', (await slots(mA.id)).includes('16:00'));

    // ── 6. Без ответа — отмена по сроку ────────────────────────────────
    const r5 = await book(client2, mB.id, '11:00');
    const b5 = r5.data?.[0]?.id;
    await admin.from('bookings').update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq('id', b5);
    const exp = await admin.rpc('expire_booking_requests');
    const s5 = await status(b5);
    check('заявка без ответа отменяется по сроку', !exp.error && s5.status === 'cancelled' && s5.cancel_reason === 'expired', exp.error?.message || JSON.stringify(s5));
    check('клиенту ушло «Заявка не подтверждена»', (await outbox(b5)).some((n) => n.user_id === client2.uid && n.type === 'booking_declined'));
    const expAnon = await client2.client.rpc('expire_booking_requests');
    check('обычный пользователь не может запустить истечение заявок', !!expAnon.error, expAnon.error?.message);

    // ── 7. Клиент отменяет заявку ──────────────────────────────────────
    const r6 = await book(client2, mB.id, '12:00');
    const b6 = r6.data?.[0]?.id;
    const cnl = await client2.client.rpc('cancel_booking', { p_booking_id: b6 });
    const s6 = await status(b6);
    check('клиент отменяет свою заявку', !cnl.error && s6.status === 'cancelled' && s6.cancel_reason === 'client', cnl.error?.message || JSON.stringify(s6));
    const o6 = await outbox(b6);
    check(
      'салону ушло «Клиент отменил запись», клиенту — ничего',
      o6.some((n) => n.user_id === owner.uid && n.type === 'booking_cancelled') && !o6.some((n) => n.user_id === client2.uid),
      JSON.stringify(o6)
    );

    // ── 8. Перенос подтверждённой записи клиентом — снова на подтверждение
    const rs = await client.client.rpc('reschedule_booking', { p_booking_id: b1, p_date: monday, p_start: '17:00' });
    const s1c = await status(b1);
    check('клиент переносит подтверждённую запись → снова pending', !rs.error && s1c.status === 'pending', rs.error?.message || s1c.status);
    const o1c = await outbox(b1);
    check('мастеру ушло «Клиент перенёс запись»', o1c.some((n) => n.user_id === staff.uid && n.title === 'Клиент перенёс запись'), JSON.stringify(o1c));
    check('напоминание снято, пока новое время не подтверждено', !o1c.some((n) => n.type === 'booking_reminder'), JSON.stringify(o1c));

    // ── 9. Запись «по звонку» — сразу подтверждена ─────────────────────
    const man = await owner.client.rpc('create_manual_booking', {
      p_business_id: bid, p_master_id: mB.id, p_service_id: svc.id, p_date: monday, p_start: '14:00', p_client_name: 'Звонок',
    });
    const sm = man.data?.[0]?.id && (await status(man.data[0].id));
    check('ручная запись владельца сразу confirmed', !man.error && sm?.status === 'confirmed', man.error?.message || sm?.status);

    // ── 10. Push на языке получателя (0031): profiles.lang ──────────────
    await client2.client.from('profiles').update({ lang: 'az' }).eq('id', client2.uid);
    await staff.client.from('profiles').update({ lang: 'en' }).eq('id', staff.uid);
    const r7 = await book(client2, mA.id, '09:00');
    const b7 = r7.data?.[0]?.id;
    const o7 = await outbox(b7);
    const staffNote = o7.find((n) => n.user_id === staff.uid);
    const ownerNote = o7.find((n) => n.user_id === owner.uid);
    check(
      'заявка: мастеру (en) — по-английски, владельцу (ru) — по-русски',
      staffNote?.title === 'New request' && ownerNote?.title === 'Новая заявка',
      JSON.stringify(o7)
    );
    await staff.client.rpc('accept_booking', { p_booking_id: b7 });
    const o7b = await outbox(b7);
    check(
      'подтверждение и напоминание клиенту (az) — по-азербайджански',
      o7b.some((n) => n.user_id === client2.uid && n.title === 'Yazılış təsdiqləndi') &&
        o7b.some((n) => n.user_id === client2.uid && n.title === 'Yazılış xatırlatması'),
      JSON.stringify(o7b.filter((n) => n.user_id === client2.uid))
    );

    console.log(failed === 0 ? '\nВсе проверки пройдены.' : `\n${failed} проверок провалено.`);
  } finally {
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
