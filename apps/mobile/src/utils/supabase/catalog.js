// Реальные запросы каталога — заменяют src/data/salonMock.js по мере
// подключения экранов. RLS уже разрешает публичное чтение
// categories/businesses(active)/services/masters (см. 0001_init.sql).
import { supabase } from './config';

export async function listCategories() {
  const { data, error } = await supabase.from('categories').select('id, name_ru, icon, parent_id').order('id');
  if (error) throw error;
  return data;
}

export async function listBusinesses({ city, categoryId } = {}) {
  let q = supabase.from('businesses').select('id, name, city, district, category_id').eq('status', 'active');
  if (city) q = q.eq('city', city);
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data, error } = await q.order('name');
  if (error) throw error;
  return data;
}

// Поиск по названию салона ИЛИ названию услуги (напр. "стрижка" находит
// салон, где такая услуга есть, даже если само название салона другое).
// Два простых запроса и склейка по id вместо full-text search — каталог
// на этой стадии маленький, ilike достаточно.
export async function searchBusinesses(query, { categoryId } = {}) {
  const q = query?.trim();
  if (!q) return listBusinesses({ categoryId });

  let byName = supabase.from('businesses').select('id, name, city, district, category_id').eq('status', 'active').ilike('name', `%${q}%`);
  if (categoryId) byName = byName.eq('category_id', categoryId);

  let byService = supabase
    .from('services')
    .select('business:businesses!inner(id, name, city, district, category_id, status)')
    .eq('business.status', 'active')
    .ilike('name', `%${q}%`);
  if (categoryId) byService = byService.eq('business.category_id', categoryId);

  const [{ data: named, error: e1 }, { data: viaService, error: e2 }] = await Promise.all([byName, byService]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byId = new Map();
  for (const b of named) byId.set(b.id, b);
  for (const row of viaService) byId.set(row.business.id, row.business);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBusiness(businessId) {
  const { data, error } = await supabase.from('businesses').select('*').eq('id', businessId).single();
  if (error) throw error;
  return data;
}

export async function listServices(businessId) {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, price, duration_min')
    .eq('business_id', businessId)
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data;
}

export async function listMasters(businessId) {
  const { data, error } = await supabase
    .from('masters')
    .select('id, name, photo_url')
    .eq('business_id', businessId)
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data;
}
