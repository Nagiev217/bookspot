// Тонкие обёртки над Postgres. В отличие от Firebase-варианта, чтение своей
// роли и запись push-токена не нуждаются в отдельных функциях — RLS-политики
// "select/update own row" на profiles разрешают это напрямую (см.
// supabase/migrations/0001_init.sql). Функция нужна только там, где логика
// пересекает границы таблиц/прав — создание бизнеса.
import { supabase } from './config';

export async function getMyProfile(uid) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, business_id')
    .eq('id', uid)
    .single();
  if (error) throw error;
  return { role: data.role, businessId: data.business_id };
}

export async function savePushToken(token) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Не авторизован');
  const { error } = await supabase.from('profiles').update({ fcm_token: token }).eq('id', user.id);
  if (error) throw error;
}

export async function createBusiness({ name, categoryId, city, district, address, phone }) {
  const { data, error } = await supabase.rpc('create_business', {
    p_name: name,
    p_category_id: categoryId,
    p_city: city,
    p_district: district ?? null,
    p_address: address ?? null,
    p_phone: phone ?? null,
  });
  if (error) throw error;
  return { businessId: data };
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
