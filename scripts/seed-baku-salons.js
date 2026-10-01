// Наполняет каталог 10 реальными (ныне существующими) салонами Баку —
// названия/адреса из веб-поиска, но услуги/цены/мастера придуманы мной
// по образцу основного сид-салона (seed.js), не подтверждены самими
// салонами. Осознанное решение владельца: тестовые данные для разработки,
// удаляются перед публикацией в App Store/Google Play — эти салоны не
// соглашались быть в приложении, и бронь через него они не увидят.
//
// В отличие от seed.js (один "рабочий" сид-салон с логином-владельцем),
// эти 10 — чистые каталожные карточки: owner_id формально указывает на
// уже существующего сид-владельца (FK этого требует), но business_members
// не заполняется — значит их нельзя редактировать ни из какого аккаунта
// через приложение, только просматривать и бронировать публично.
//
// Запуск: cd scripts && npm run seed-baku
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в scripts/.env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OWNER_EMAIL = 'owner@bookspot.dev';

const MASTER_NAMES = ['Эмин', 'Лейла', 'Рашад', 'Севиндж', 'Кямран', 'Гюнель', 'Фарид', 'Нармин', 'Ильгар', 'Айгюн'];

const SALONS = [
  {
    name: 'BLACKOUT Барбершоп',
    category_id: 'barber',
    district: 'Сабаильский',
    address: 'ул. Низами, 239',
    phone: null,
    services: [
      { name: 'Мужская стрижка', price: 35, duration_min: 45 },
      { name: 'Стрижка + борода', price: 50, duration_min: 60 },
      { name: 'Королевское бритьё', price: 30, duration_min: 40 },
    ],
  },
  {
    name: 'Eldar Studio',
    category_id: 'barber',
    district: 'Насиминский',
    address: 'ул. Анвара Гасымзаде, 22A',
    phone: null,
    services: [
      { name: 'Мужская стрижка', price: 35, duration_min: 45 },
      { name: 'Стрижка + борода', price: 50, duration_min: 60 },
      { name: 'Королевское бритьё', price: 30, duration_min: 40 },
    ],
  },
  {
    name: 'KINGSTON',
    category_id: 'barber',
    district: 'Насиминский',
    address: 'ул. Зарифы Алиевой, 31Б',
    phone: null,
    services: [
      { name: 'Мужская стрижка', price: 35, duration_min: 45 },
      { name: 'Стрижка + борода', price: 50, duration_min: 60 },
      { name: 'Королевское бритьё', price: 30, duration_min: 40 },
    ],
  },
  {
    name: 'Cahan studio',
    category_id: 'beauty',
    district: 'Сабаильский',
    address: 'ул. Низами, 86',
    phone: null,
    services: [
      { name: 'Укладка', price: 25, duration_min: 45 },
      { name: 'Дневной макияж', price: 40, duration_min: 60 },
      { name: 'Окрашивание', price: 90, duration_min: 120 },
    ],
  },
  {
    name: 'AF BEAUTY STUDIO',
    category_id: 'beauty',
    district: 'Насиминский',
    address: 'Сулейман Рустам, 60/44',
    phone: null,
    services: [
      { name: 'Укладка', price: 25, duration_min: 45 },
      { name: 'Дневной макияж', price: 40, duration_min: 60 },
      { name: 'Окрашивание', price: 90, duration_min: 120 },
    ],
  },
  {
    name: 'ALLURE STUDIO',
    category_id: 'beauty',
    district: 'Ясамальский',
    address: 'просп. Гусейна Джавида, 15',
    phone: null,
    services: [
      { name: 'Укладка', price: 25, duration_min: 45 },
      { name: 'Дневной макияж', price: 40, duration_min: 60 },
      { name: 'Окрашивание', price: 90, duration_min: 120 },
    ],
  },
  {
    name: 'The Nail Bar',
    category_id: 'nails',
    district: 'Хатаинский',
    address: 'Афиеддин Джалилов, 24A',
    phone: '+994552026310',
    services: [
      { name: 'Маникюр классический', price: 25, duration_min: 60 },
      { name: 'Покрытие гель-лак', price: 20, duration_min: 45 },
    ],
  },
  {
    name: 'Lash factor',
    category_id: 'lashes',
    district: 'Сабаильский',
    address: 'ул. Низами, 70',
    phone: null,
    services: [
      { name: 'Наращивание ресниц (классика)', price: 40, duration_min: 90 },
      { name: 'Ламинирование ресниц', price: 30, duration_min: 60 },
    ],
  },
  {
    name: 'Центр массажной терапии',
    category_id: 'massage',
    district: 'Насиминский',
    address: 'просп. Ходжалы, 29',
    phone: null,
    services: [
      { name: 'Классический массаж 60 мин', price: 45, duration_min: 60 },
      { name: 'Массаж спины', price: 30, duration_min: 40 },
    ],
  },
  {
    name: 'AHMED TATTOO',
    category_id: 'tattoo',
    district: 'Насиминский',
    address: 'ул. Лев Толстой, 172',
    phone: null,
    services: [
      { name: 'Тату малого размера', price: 150, duration_min: 120 },
      { name: 'Тату среднего размера', price: 250, duration_min: 180 },
    ],
  },
];

async function findUserByEmail(email) {
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

async function ensureSalon(salon, ownerUid, masterName) {
  const { data: existing, error: selErr } = await admin
    .from('businesses')
    .select('id')
    .eq('name', salon.name)
    .eq('city', 'Баку')
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    console.log(`✓ ${salon.name} уже есть`);
    return;
  }

  const { data: business, error: bizErr } = await admin
    .from('businesses')
    .insert({
      owner_id: ownerUid,
      name: salon.name,
      category_id: salon.category_id,
      city: 'Баку',
      district: salon.district,
      address: salon.address,
      phone: salon.phone,
      published_at: new Date().toISOString(), // демо-салон сразу в каталоге (0024)
    })
    .select('id')
    .single();
  if (bizErr) throw bizErr;

  const { data: services, error: svcErr } = await admin
    .from('services')
    .insert(salon.services.map((s) => ({ ...s, business_id: business.id })))
    .select('id');
  if (svcErr) throw svcErr;

  const { data: master, error: masterErr } = await admin
    .from('masters')
    .insert({ business_id: business.id, name: masterName })
    .select('id')
    .single();
  if (masterErr) throw masterErr;

  const { error: schedErr } = await admin.from('master_schedule').insert(
    [1, 2, 3, 4, 5, 6].map((day) => ({ master_id: master.id, day_of_week: day, start_min: 600, end_min: 1140 })) // Пн-Сб 10:00-19:00
  );
  if (schedErr) throw schedErr;

  const { error: linkErr } = await admin
    .from('service_masters')
    .insert(services.map((s) => ({ service_id: s.id, master_id: master.id })));
  if (linkErr) throw linkErr;

  console.log(`✓ ${salon.name} создан (${salon.services.length} услуги, мастер ${masterName})`);
}

async function main() {
  const owner = await findUserByEmail(OWNER_EMAIL);
  if (!owner) {
    console.error(`Не найден сид-владелец ${OWNER_EMAIL} — сначала запустите npm run seed`);
    process.exit(1);
  }

  for (let i = 0; i < SALONS.length; i++) {
    await ensureSalon(SALONS[i], owner.id, MASTER_NAMES[i]);
  }

  console.log('\nГотово.');
}

main().catch((err) => {
  console.error('Сид упал:', err.message || err);
  process.exit(1);
});
