// Отзывы о салоне. Создание — только через RPC (create_review проверяет,
// что бронь принадлежит вызывающему и что визит завершён — см.
// 0019_reviews.sql), редактирование/удаление своего отзыва — напрямую под
// RLS (reviews_own_update/reviews_own_delete), без RPC, потому что здесь нет
// пересекающихся инвариантов вроде EXCLUDE-constraint у bookings.
import { supabase } from './config';

export async function listReviews(businessId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, client_name, rating, comment, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getReviewForBooking(bookingId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createReview({ bookingId, rating, comment }) {
  const { data, error } = await supabase.rpc('create_review', {
    p_booking_id: bookingId,
    p_rating: rating,
    p_comment: comment || null,
  });
  if (error) throw error;
  return data[0];
}

export async function updateReview(reviewId, { rating, comment }) {
  const { error } = await supabase.from('reviews').update({ rating, comment: comment || null }).eq('id', reviewId);
  if (error) throw error;
}

export async function deleteReview(reviewId) {
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
  if (error) throw error;
}
