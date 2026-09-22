// Ставит дженерик-фото по категории в businesses.logo_url тем салонам, у
// которых поле ещё пустое (idempotent — уже загруженное владельцем фото
// не трогает). Это НЕ фото конкретного салона — просто иллюстрация
// категории (барбершоп/бьюти/ногти и т.д.), прямая ссылка на Unsplash CDN,
// без загрузки в наш Storage. Для 10 каталожных салонов без владельца
// (seed-baku-salons.js) это тот же уровень условности, что и придуманные
// услуги/мастера — не выдаём это за реальное фото данного заведения.
// Настоящее фото своего салона владелец добавляет через
// "Настройки бизнеса" (uploadBusinessPhoto) — этот скрипт только закрывает
// пустые карточки, пока владельца нет.
//
// Запуск: cd scripts && node --env-file=.env add-category-photos.js
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

const PHOTO_BY_CATEGORY = {
  barber: 'https://images.unsplash.com/photo-1675599193990-33d71150902b?w=1200&q=75&auto=format&fit=crop',
  beauty: 'https://images.unsplash.com/photo-1781450090585-1a511b7066d9?w=1200&q=75&auto=format&fit=crop',
  nails: 'https://images.unsplash.com/photo-1633955726992-2b7c0d2d2a69?w=1200&q=75&auto=format&fit=crop',
  lashes: 'https://images.unsplash.com/photo-1750967785153-ac30b4eb9ac6?w=1200&q=75&auto=format&fit=crop',
  tattoo: 'https://images.unsplash.com/photo-1516008684536-605574d804ce?w=1200&q=75&auto=format&fit=crop',
  massage: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?w=1200&q=75&auto=format&fit=crop',
};

async function main() {
  const { data: businesses, error } = await admin.from('businesses').select('id, name, category_id, logo_url');
  if (error) throw error;

  for (const b of businesses) {
    if (b.logo_url) {
      console.log(`✓ ${b.name} уже с фото — пропуск`);
      continue;
    }
    const url = PHOTO_BY_CATEGORY[b.category_id];
    if (!url) {
      console.log(`? ${b.name}: нет дженерик-фото для категории "${b.category_id}"`);
      continue;
    }
    const { error: updErr } = await admin.from('businesses').update({ logo_url: url }).eq('id', b.id);
    if (updErr) throw updErr;
    console.log(`✓ ${b.name} → фото категории "${b.category_id}"`);
  }

  console.log('\nГотово.');
}

main().catch((err) => {
  console.error('Скрипт упал:', err.message || err);
  process.exit(1);
});
