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

// Завершение визита — бизнес отмечает "пришёл"/"не пришёл" на прошедшей
// брони. p_status: 'completed' | 'no_show'. RPC сама проверяет доступ,
// текущий статус и что визит уже наступил (0015_booking_lifecycle.sql).
export async function completeBooking(bookingId, status) {
  const { error } = await supabase.rpc('complete_booking', { p_booking_id: bookingId, p_status: status });
  if (error) throw error;
}

// История визитов — то, что раньше видно было только на день/неделю вперёд
// (calendar.jsx), а завершённые/неявки/отменённые визиты вообще пропадали
// из вида (day-grid фильтрует только status === 'confirmed'). Здесь —
// плоский список по всем мастерам сразу, самые новые сверху: завершённые,
// неявки, отменённые, плюс confirmed, у которых время уже прошло (владелец
// ещё не успел отметить — тоже часть "истории", не только день/неделя).
// Лимит 100 — без пагинации, этого достаточно для повседневного просмотра.
//
// Два отдельных запроса и слияние на клиенте, а не один .or() — так проще
// быть уверенным в корректности фильтра без возможности прогнать его на
// реальной базе перед выкаткой.
const HISTORY_COLUMNS = 'id, master_id, service_name, price, starts_at, ends_at, status, client_name, client_phone';

export async function listBusinessHistory(businessId) {
  const nowIso = new Date().toISOString();
  const [nonConfirmed, overdueConfirmed] = await Promise.all([
    supabase.from('bookings').select(HISTORY_COLUMNS).eq('business_id', businessId).neq('status', 'confirmed').order('starts_at', { ascending: false }).limit(100),
    supabase.from('bookings').select(HISTORY_COLUMNS).eq('business_id', businessId).eq('status', 'confirmed').lt('starts_at', nowIso).order('starts_at', { ascending: false }).limit(100),
  ]);
  if (nonConfirmed.error) throw nonConfirmed.error;
  if (overdueConfirmed.error) throw overdueConfirmed.error;
  return [...nonConfirmed.data, ...overdueConfirmed.data]
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    .slice(0, 100);
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
  const { data, error } = await supabase.from('masters').select('id, name, active, business_id, photo_url').eq('id', masterId).single();
  if (error) throw error;
  return data;
}

export async function listAllMasters(businessId) {
  const { data, error } = await supabase
    .from('masters')
    .select('id, name, photo_url, active, user_id')
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

// base64 → ArrayBuffer вручную: RN'ный fetch(uri).blob() на некоторых
// устройствах отдаёт в Supabase Storage битый/нулевой файл (известная
// проблема react-native+supabase-js), а expo-image-picker и так умеет
// вернуть base64 напрямую — лишняя зависимость не нужна.
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function uploadPhoto(path, base64, contentType) {
  const { error: upErr } = await supabase.storage
    .from('photos')
    .upload(path, base64ToArrayBuffer(base64), { contentType, upsert: true });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`; // кэш-бастер: путь фиксированный, upsert перезаписывает
}

export async function uploadBusinessPhoto(businessId, base64, ext = 'jpg') {
  const url = await uploadPhoto(`business/${businessId}/logo.${ext}`, base64, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
  await updateBusiness(businessId, { logo_url: url });
  return url;
}

export async function uploadMasterPhoto(masterId, base64, ext = 'jpg') {
  const url = await uploadPhoto(`master/${masterId}/photo.${ext}`, base64, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
  await updateMaster(masterId, { photo_url: url });
  return url;
}
