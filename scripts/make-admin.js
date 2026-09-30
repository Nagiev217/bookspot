// Назначает платформенного администратора по email: он получает в приложении
// режим «Админка» (создание салонов, подписки). Пользователь должен уже
// существовать — сначала зарегистрироваться в приложении под этим email.
//
// Запуск:  cd scripts && npm run make-admin -- doich3609@gmail.com
// Снять:   npm run make-admin -- doich3609@gmail.com --remove
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в scripts/.env');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUserByEmail(email) {
  // listUsers не фильтрует по email на сервере — фильтруем сами (как в seed.js).
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const remove = process.argv.includes('--remove');
  if (!email) throw new Error('Укажите email: npm run make-admin -- you@example.com');

  const user = await findUserByEmail(email);
  if (!user) throw new Error(`Пользователь ${email} не найден — сначала зарегистрируйтесь в приложении под этим email`);

  const { error } = await admin.rpc('set_platform_admin', { p_user_id: user.id, p_on: !remove });
  if (error) throw error;
  console.log(remove ? `✓ ${email} больше не администратор` : `✓ ${email} теперь администратор. Перезайдите в приложение — откроется режим «Админка».`);
}

main().catch((e) => {
  console.error('Не получилось:', e.message || e);
  process.exit(1);
});
