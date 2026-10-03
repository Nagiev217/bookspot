// Тонкие обёртки над Postgres. В отличие от Firebase-варианта, чтение своей
// роли и запись push-токена не нуждаются в отдельных функциях — RLS-политики
// "select/update own row" на profiles разрешают это напрямую (см.
// supabase/migrations/0001_init.sql). Функция нужна только там, где логика
// пересекает границы таблиц/прав — создание бизнеса.
import { supabase } from './config';
import { setCachedRole, resolveMode } from '@/utils/auth/roleCache';
import { t, getLang } from '@/utils/i18n';

export async function getMyProfile(uid) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, business_id, must_change_password, lang')
    .eq('id', uid)
    .single();
  if (error) throw error;
  // Мастер (staff) видит только свой календарь — нужен id его мастера.
  let masterId = null;
  if (data.role === 'staff') {
    const { data: m } = await supabase.from('masters').select('id').eq('user_id', uid).maybeSingle();
    masterId = m?.id ?? null;
  }
  return { role: data.role, businessId: data.business_id, masterId, mustChangePassword: !!data.must_change_password, lang: data.lang };
}

// Собирает всё состояние авторизации после входа — одно место для
// _layout.jsx, login.jsx и register.jsx, чтобы правила режима и кэша не
// расходились между ними.
export async function buildSession(uid) {
  const { lang, ...profile } = await getMyProfile(uid);
  // Язык приложения — в профиль: по нему сервер выбирает язык push (0031).
  if (lang !== getLang()) saveMyLang(getLang()).catch(() => {});
  const mode = await resolveMode(uid, profile.role);
  await setCachedRole(uid, profile.role, profile.businessId, profile.masterId);
  return { status: 'signedIn', uid, ...profile, mode };
}

// Смена временного пароля при первом входе.
export async function changeMyPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  const { error: rpcErr } = await supabase.rpc('clear_must_change_password');
  if (rpcErr) throw rpcErr;
}

export async function saveMyLang(lang) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from('profiles').update({ lang }).eq('id', user.id);
  if (error) throw error;
}

export async function savePushToken(token) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(t('utils_supabase_profile.1'));
  const { error } = await supabase.from('profiles').update({ fcm_token: token }).eq('id', user.id);
  if (error) throw error;
}

export async function updateProfile(uid, { name, phone, lang }) {
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (phone !== undefined) patch.phone = phone;
  if (lang !== undefined) patch.lang = lang;
  const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
  if (error) throw error;
}

// Безвозвратное удаление аккаунта (Apple Guideline 5.1.1(v)). Брони не
// исчезают — RPC delete_my_account (0013_delete_account.sql) обезличивает их
// на сервере, они остаются историей визитов у бизнеса. Владельца активного
// бизнеса функция сама отклонит с понятной ошибкой — здесь это не проверяем
// заранее, чтобы не дублировать правило в двух местах.
export async function deleteMyAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

// Имя, телефон и email — для профиля и «Моих данных».
export async function getMyContact(uid) {
  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase.from('profiles').select('name, phone').eq('id', uid).single(),
    supabase.auth.getUser(),
  ]);
  if (error) throw error;
  return { name: data.name, phone: data.phone, email: auth?.user?.email ?? '' };
}
