// Реальное бронирование — вызывает get_availability/create_booking RPC
// (supabase/migrations/0003_availability.sql, 0004_fix_create_booking_ambiguity.sql).
import { supabase } from './config';

// Возвращает { "2026-09-20": ["10:00", "10:15", ...], ... } — сгруппировано
// по дате, каждая строка уже "HH:MM" в местном времени Баку (сервер
// форматирует, клиенту конвертировать нечего).
export async function getAvailability({ masterId, serviceId, from, days = 7 }) {
  const { data, error } = await supabase.rpc('get_availability', {
    p_master_id: masterId,
    p_service_id: serviceId,
    p_from: from,
    p_days: days,
  });
  if (error) throw error;
  const byDate = {};
  for (const row of data) {
    (byDate[row.slot_date] ??= []).push(row.slot_time);
  }
  return byDate;
}

// Бросает ошибку с кодом '23P01' (сообщение уже на русском из RPC), если
// слот только что заняли — вызывающий экран должен обновить доступность.
export async function createBooking({ businessId, masterId, serviceId, date, start }) {
  const { data, error } = await supabase.rpc('create_booking', {
    p_business_id: businessId,
    p_master_id: masterId,
    p_service_id: serviceId,
    p_date: date,
    p_start: start,
  });
  if (error) throw error;
  return data[0];
}

// businesses(...) — embedded-select через FK bookings.business_id -> businesses.id,
// один запрос вместо N+1.
export async function listMyBookings() {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, business_id, master_id, service_id, service_name, price, starts_at, ends_at, status, businesses(name, city, district)')
    .order('starts_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getBooking(bookingId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, business_id, master_id, service_id, service_name, price, starts_at, ends_at, status, businesses(name, city, district)')
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  return data;
}

export async function cancelBooking(bookingId) {
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
  if (error) throw error;
}

// Бросает ошибку с кодом '23P01', если новый слот заняли — экран должен
// перезапросить доступность и дать выбрать другое время.
export async function rescheduleBooking({ bookingId, date, start }) {
  const { data, error } = await supabase.rpc('reschedule_booking', {
    p_booking_id: bookingId,
    p_date: date,
    p_start: start,
  });
  if (error) throw error;
  return data[0];
}
