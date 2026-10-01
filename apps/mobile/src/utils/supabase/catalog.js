// Реальные запросы каталога — заменяют src/data/salonMock.js по мере
// подключения экранов. RLS уже разрешает публичное чтение
// categories/businesses(active)/services/masters (см. 0001_init.sql).
import { supabase } from './config';

export async function listCategories() {
  const { data, error } = await supabase.from('categories').select('id, name_ru, icon, parent_id').order('id');
  if (error) throw error;
  return data;
}

// Каталог показывает только то, что видит гость: активный, опубликованный
// (0024) салон с неистёкшей подпиской (0022). RLS это уже гарантирует для
// гостя и обычного клиента, но admin и участники салона по RLS видят и
// неопубликованные/просроченные салоны — в клиентском режиме им их
// показывать нельзя, поэтому те же условия дублируются в запросе.
function bakuTodayISO() {
  return new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
}

function onlyPublic(q, prefix = '') {
  return q
    .eq(`${prefix}status`, 'active')
    .not(`${prefix}published_at`, 'is', null)
    .or(`paid_until.is.null,paid_until.gte.${bakuTodayISO()}`, prefix ? { referencedTable: prefix.slice(0, -1) } : undefined);
}

export async function listBusinesses({ city, categoryId } = {}) {
  let q = onlyPublic(supabase.from('businesses').select('id, name, city, district, category_id, logo_url'));
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

  let byName = onlyPublic(supabase.from('businesses').select('id, name, city, district, category_id, logo_url')).ilike('name', `%${q}%`);
  if (categoryId) byName = byName.eq('category_id', categoryId);

  let byService = onlyPublic(
    supabase.from('services').select('business:businesses!inner(id, name, city, district, category_id, status, logo_url)'),
    'business.'
  ).ilike('name', `%${q}%`);
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
    .select('id, name, photo_url, bio')
    .eq('business_id', businessId)
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data;
}

// ─── Страница мастера для клиента ───────────────────────────────────────

export async function getMasterPublic(masterId) {
  const { data, error } = await supabase
    .from('masters')
    .select('id, name, photo_url, bio, business_id, active')
    .eq('id', masterId)
    .single();
  if (error) throw error;
  return data;
}

// Услуги, которые выполняет мастер (service_masters), только активные.
export async function listMasterServices(masterId) {
  const { data, error } = await supabase
    .from('service_masters')
    .select('service:services!inner(id, name, price, duration_min, active)')
    .eq('master_id', masterId)
    .eq('service.active', true);
  if (error) throw error;
  return data.map((r) => r.service).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listMasterReviews(masterId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, client_name, rating, comment, created_at')
    .eq('master_id', masterId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
