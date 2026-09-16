// Запросы для Business mode. bookings читается напрямую (не через RPC) —
// RLS "bookings_read_own_or_business" (0001_init.sql) уже разрешает
// участнику бизнеса читать все брони своего бизнеса без дополнительного
// эндпоинта.
import { supabase } from './config';

export async function getMyBusiness(businessId) {
  const { data, error } = await supabase.from('businesses').select('*').eq('id', businessId).single();
  if (error) throw error;
  return data;
}

// [from, from+days) по местной дате Баку.
export async function listBusinessBookings({ businessId, from, days = 1 }) {
  const fromUtc = new Date(`${from}T00:00:00+04:00`).toISOString();
  const toUtc = new Date(`${from}T00:00:00+04:00`);
  toUtc.setUTCDate(toUtc.getUTCDate() + days);
  const { data, error } = await supabase
    .from('bookings')
    .select('id, master_id, service_name, price, starts_at, ends_at, status, client_name, client_phone')
    .eq('business_id', businessId)
    .gte('starts_at', fromUtc)
    .lt('starts_at', toUtc.toISOString())
    .order('starts_at');
  if (error) throw error;
  return data;
}

export async function createManualBooking({ businessId, masterId, serviceId, date, start, clientName, clientPhone }) {
  const { data, error } = await supabase.rpc('create_manual_booking', {
    p_business_id: businessId,
    p_master_id: masterId,
    p_service_id: serviceId,
    p_date: date,
    p_start: start,
    p_client_name: clientName,
    p_client_phone: clientPhone || null,
  });
  if (error) throw error;
  return data[0];
}

export async function setMasterDayOff(masterId, dateISO, dayOff) {
  if (dayOff) {
    const { error } = await supabase.from('master_exceptions').insert({ master_id: masterId, date: dateISO, type: 'day_off' });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('master_exceptions').delete().eq('master_id', masterId).eq('date', dateISO);
    if (error) throw error;
  }
}

export async function isMasterOffOn(masterId, dateISO) {
  const { data, error } = await supabase
    .from('master_exceptions')
    .select('id')
    .eq('master_id', masterId)
    .eq('date', dateISO)
    .eq('type', 'day_off')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// Будущие выходные мастера — для календаря на несколько дней вперёд
// (setMasterDayOff/isMasterOffOn выше уже общие по дате, ограничение на
// "только сегодня" было только в UI team.jsx).
export async function listUpcomingDaysOff(masterId, fromDateISO) {
  const { data, error } = await supabase
    .from('master_exceptions')
    .select('date')
    .eq('master_id', masterId)
    .eq('type', 'day_off')
    .gte('date', fromDateISO)
    .order('date');
  if (error) throw error;
  return data.map((r) => r.date);
}

// ─── Услуги, мастера, расписание — управление бизнесом ────────────────────
// Пишутся напрямую с клиента (не через RPC): RLS "*_member_write" в
// 0001_init.sql уже разрешает участнику бизнеса полный CRUD, отдельный
// эндпоинт тут не нужен.

export async function listAllServices(businessId) {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, price, duration_min, active')
    .eq('business_id', businessId)
    .order('name');
  if (error) throw error;
  return data;
}

export async function createService({ businessId, name, price, durationMin }) {
  const { data, error } = await supabase
    .from('services')
    .insert({ business_id: businessId, name, price, duration_min: durationMin })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateService(serviceId, patch) {
  const { error } = await supabase.from('services').update(patch).eq('id', serviceId);
  if (error) throw error;
}

export async function deleteService(serviceId) {
  const { error } = await supabase.from('services').delete().eq('id', serviceId);
  if (error) throw error;
}

export async function listServiceMasterIds(serviceId) {
  const { data, error } = await supabase.from('service_masters').select('master_id').eq('service_id', serviceId);
  if (error) throw error;
  return data.map((r) => r.master_id);
}

// Полная замена привязки услуга↔мастера — проще и надёжнее диффа для формы
// с чекбоксами, где количество мастеров у салона мало.
export async function setServiceMasters(serviceId, masterIds) {
  const { error: delErr } = await supabase.from('service_masters').delete().eq('service_id', serviceId);
  if (delErr) throw delErr;
  if (masterIds.length === 0) return;
  const { error } = await supabase.from('service_masters').insert(masterIds.map((masterId) => ({ service_id: serviceId, master_id: masterId })));
  if (error) throw error;
}

export async function getMaster(masterId) {
  const { data, error } = await supabase.from('masters').select('id, name, active, business_id').eq('id', masterId).single();
  if (error) throw error;
  return data;
}

export async function listAllMasters(businessId) {
  const { data, error } = await supabase
    .from('masters')
    .select('id, name, photo_url, active')
    .eq('business_id', businessId)
    .order('name');
  if (error) throw error;
  return data;
}

export async function createMaster({ businessId, name }) {
  const { data, error } = await supabase.from('masters').insert({ business_id: businessId, name }).select().single();
  if (error) throw error;
  return data;
}

export async function updateMaster(masterId, patch) {
  const { error } = await supabase.from('masters').update(patch).eq('id', masterId);
  if (error) throw error;
}

// Минуты от полуночи — та же конвенция, что в get_availability (0003_availability.sql).
export async function getMasterSchedule(masterId) {
  const { data, error } = await supabase
    .from('master_schedule')
    .select('id, day_of_week, start_min, end_min')
    .eq('master_id', masterId)
    .order('day_of_week');
  if (error) throw error;
  return data;
}

// Полная замена расписания на неделю — проще, чем диффить построчно
// изменённую форму, а расписание правится редко и не гонится за апдейтами.
export async function replaceMasterSchedule(masterId, rows) {
  const { error: delErr } = await supabase.from('master_schedule').delete().eq('master_id', masterId);
  if (delErr) throw delErr;
  if (rows.length === 0) return;
  const { error } = await supabase.from('master_schedule').insert(rows.map((r) => ({ master_id: masterId, ...r })));
  if (error) throw error;
}

export async function updateBusiness(businessId, patch) {
  const { error } = await supabase.from('businesses').update(patch).eq('id', businessId);
  if (error) throw error;
}
