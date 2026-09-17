// Избранное — клиент читает/пишет только свои строки напрямую под RLS
// (favorites_own_* в 0009_favorites.sql), без RPC.
import { supabase } from './config';

export async function listFavoriteBusinesses(uid) {
  const { data, error } = await supabase
    .from('favorites')
    .select('business:businesses(id, name, city, district, category_id, status, logo_url)')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // status фильтруем на клиенте — RLS отдаёт join как есть, даже если
  // бизнес деактивирован; в списке избранного его показывать не нужно.
  return data.map((r) => r.business).filter((b) => b && b.status === 'active');
}

export async function isFavorite(uid, businessId) {
  const { data, error } = await supabase.from('favorites').select('user_id').eq('user_id', uid).eq('business_id', businessId).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function addFavorite(uid, businessId) {
  const { error } = await supabase.from('favorites').insert({ user_id: uid, business_id: businessId });
  if (error) throw error;
}

export async function removeFavorite(uid, businessId) {
  const { error } = await supabase.from('favorites').delete().eq('user_id', uid).eq('business_id', businessId);
  if (error) throw error;
}
