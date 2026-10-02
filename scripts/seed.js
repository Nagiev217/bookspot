// Наполняет базу тестовыми данными: категории + один салон (Atelier Nizami)
// с двумя мастерами, услугами "рваной" длительности и недельным
// расписанием — минимум, достаточный чтобы пройти весь путь клиента
// end-to-end (Home → салон → бронирование). Безопасно перезапускать.
//
// Запуск: cd scripts && npm install && npm run seed
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в scripts/.env');
  process.exit(1);
}

// service_role обходит RLS — используется только здесь, никогда в клиенте.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OWNER_EMAIL = 'owner@bookspot.dev';
const OWNER_PASSWORD = 'Seed12345!';

const CATEGORIES = [
  { id: 'tattoo', name_az: 'Tattoo', name_ru: 'Tattoo', name_en: 'Tattoo' },
  { id: 'barber', name_az: 'Barber', name_ru: 'Barber', name_en: 'Barber' },
  { id: 'beauty', name_az: 'Beauty', name_ru: 'Beauty', name_en: 'Beauty' },
  { id: 'nails', name_az: 'Nails', name_ru: 'Nails', name_en: 'Nails' },
  { id: 'lashes', name_az: 'Lashes', name_ru: 'Lashes', name_en: 'Lashes' },
  { id: 'massage', name_az: 'Massage', name_ru: 'Massage', name_en: 'Massage' },
];

// "Рваные" длительности — намеренно не кратны шагу сетки (15 мин), чтобы
// сразу проверить, что алгоритм слотов (shared/slots.js) их не ломает.
const SERVICES = [
  { name: 'Мужская стрижка', price: 45, duration_min: 45 },
  { name: 'Стрижка + борода', price: 65, duration_min: 70 },
  { name: 'Королевское бритьё', price: 55, duration_min: 50 },
  { name: 'Детская стрижка', price: 30, duration_min: 30 },
];

const MASTERS = [
  { name: 'Тогрул', schedule: { days: [1, 2, 3, 4, 5, 6], start: 600, end: 1200 } }, // Пн-Сб 10:00-20:00
  { name: 'Айсель', schedule: { days: [2, 3, 4, 5, 6, 0], start: 660, end: 1200 } }, // Вт-Вс 11:00-20:00
];

async function findUserByEmail(email) {
  // listUsers не фильтрует по email на сервере в этой версии SDK — фильтруем сами.
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureOwner() {
  let user = await findUserByEmail(OWNER_EMAIL);
  if (user) {
    console.log(`✓ Владелец уже существует: ${OWNER_EMAIL}`);
    return user;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
    user_metadata: { name: 'Nizami Aliyev', lang: 'ru' },
  });
  if (error) throw error;
  console.log(`✓ Создан владелец: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  return data.user;
}

async function ensureCategories() {
  const { error } = await admin.from('categories').upsert(CATEGORIES, { onConflict: 'id' });
  if (error) throw error;
  console.log(`✓ Категории: ${CATEGORIES.length}`);
}

async function ensureBusiness(ownerUid) {
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('business_id')
    .eq('id', ownerUid)
    .single();
  if (profileErr) throw profileErr;

  if (profile.business_id) {
    console.log(`✓ Бизнес уже создан: ${profile.business_id}`);
    return profile.business_id;
  }

  // Салоны создаёт только admin (0022) — тот же RPC, что вызывает Edge
  // Function manage-accounts, через service_role.
  const { data: businessId, error: rpcErr } = await admin.rpc('admin_create_business', {
    p_owner_id: ownerUid,
    p_name: 'Atelier Nizami',
    p_category_id: 'barber',
    p_city: 'Баку',
    p_district: 'Ичеришехер',
    p_address: 'ул. Асаф Зейналлы, 7',
    p_phone: '+994501234567',
    p_paid_until: null,
  });
  if (rpcErr) throw rpcErr;
  // Новый салон скрыт, пока не пройдён чек-лист (0024). Тестовым фикстурам
  // он не нужен — публикуем сразу через service_role.
  await admin.from('businesses').update({ published_at: new Date().toISOString(), lat: 40.3664, lng: 49.8372 }).eq('id', businessId);
  // Сид-владелец входит с известным паролем — смена временного пароля ему не нужна.
  await admin.from('profiles').update({ must_change_password: false }).eq('id', ownerUid);
  console.log(`✓ Создан бизнес: Atelier Nizami (${businessId})`);
  return businessId;
}

async function ensureServices(businessId) {
  const { data: existing, error: selErr } = await admin.from('services').select('id, name').eq('business_id', businessId);
  if (selErr) throw selErr;
  if (existing.length > 0) {
    console.log(`✓ Услуги уже есть: ${existing.length}`);
    return existing;
  }
  const rows = SERVICES.map((s) => ({ ...s, business_id: businessId }));
  const { data, error } = await admin.from('services').insert(rows).select('id, name');
  if (error) throw error;
  console.log(`✓ Услуги: ${data.length}`);
  return data;
}

async function ensureMasters(businessId) {
  const { data: existing, error: selErr } = await admin.from('masters').select('id, name').eq('business_id', businessId);
  if (selErr) throw selErr;
  if (existing.length > 0) {
    console.log(`✓ Мастера уже есть: ${existing.length}`);
    return existing;
  }
  const rows = MASTERS.map((m) => ({ business_id: businessId, name: m.name }));
  const { data, error } = await admin.from('masters').insert(rows).select('id, name');
  if (error) throw error;
  console.log(`✓ Мастера: ${data.length}`);
  return data;
}

async function ensureServiceMasters(services, masters) {
  const { count, error: countErr } = await admin
    .from('service_masters')
    .select('*', { count: 'exact', head: true })
    .in(
      'service_id',
      services.map((s) => s.id)
    );
  if (countErr) throw countErr;
  if (count > 0) {
    console.log(`✓ Связи услуга↔мастер уже есть: ${count}`);
    return;
  }
  // MVP: оба мастера выполняют все услуги.
  const rows = [];
  for (const s of services) {
    for (const m of masters) {
      rows.push({ service_id: s.id, master_id: m.id });
    }
  }
  const { error } = await admin.from('service_masters').insert(rows);
  if (error) throw error;
  console.log(`✓ Связи услуга↔мастер: ${rows.length}`);
}

async function ensureSchedules(masters) {
  const { data: existing, error: selErr } = await admin
    .from('master_schedule')
    .select('id, master_id')
    .in(
      'master_id',
      masters.map((m) => m.id)
    );
  if (selErr) throw selErr;
  if (existing.length > 0) {
    console.log(`✓ Расписания уже есть: ${existing.length} строк`);
    return;
  }
  const rows = [];
  masters.forEach((m, i) => {
    const cfg = MASTERS[i].schedule;
    for (const day of cfg.days) {
      rows.push({ master_id: m.id, day_of_week: day, start_min: cfg.start, end_min: cfg.end });
    }
  });
  const { error } = await admin.from('master_schedule').insert(rows);
  if (error) throw error;
  console.log(`✓ Расписания: ${rows.length} строк`);
}

async function main() {
  await ensureCategories();
  const owner = await ensureOwner();
  const businessId = await ensureBusiness(owner.id);
  const services = await ensureServices(businessId);
  const masters = await ensureMasters(businessId);
  await ensureServiceMasters(services, masters);
  await ensureSchedules(masters);

  console.log('\nГотово. Вход в приложении:');
  console.log(`  email:    ${OWNER_EMAIL}`);
  console.log(`  password: ${OWNER_PASSWORD}`);
}

main().catch((err) => {
  console.error('Сид упал:', err.message || err);
  process.exit(1);
});
