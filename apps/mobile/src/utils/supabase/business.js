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
