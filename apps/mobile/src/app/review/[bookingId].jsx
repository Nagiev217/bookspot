// Отзыв о завершённом визите — создание/редактирование в одном экране
// (та же структура загрузки, что reschedule/[bookingId].jsx: useFocusEffect
// + getBooking, плюс getReviewForBooking для предзаполнения при повторном
// заходе). create_review (0019_reviews.sql) сам проверяет, что бронь
// принадлежит вызывающему и что визит завершён — здесь это не дублируется.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { getBooking } from '@/utils/supabase/booking';
import { getReviewForBooking, createReview, updateReview } from '@/utils/supabase/reviews';
import { friendlyError } from '@/utils/errors';

export default function ReviewScreen() {
  const { bookingId } = useLocalSearchParams();
  const [booking, setBooking] = useState(null);
  const [existingReview, setExistingReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getBooking(bookingId), getReviewForBooking(bookingId)])
        .then(([b, r]) => {
          if (cancelled) return;
          setBooking(b);
          if (r) {
            setExistingReview(r);
            setRating(r.rating);
            setComment(r.comment || '');
          }
        })
        .catch((e) => !cancelled && setError(friendlyError(e, 'Не удалось загрузить')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [bookingId])
  );

  async function handleSubmit() {
    if (rating < 1) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (existingReview) {
        await updateReview(existingReview.id, { rating, comment });
      } else {
        await createReview({ bookingId, rating, comment });
      }
      router.back();
    } catch (e) {
      setSaveError(friendlyError(e, 'Не удалось сохранить отзыв'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }
  if (error || !booking) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Бронь не найдена'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <View style={styles.headerRow}>
          <PressableScale style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={17} color={COLORS.ink} />
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{existingReview ? 'Изменить отзыв' : 'Оставить отзыв'}</Text>
            <Text style={styles.sub}>
              {booking.businesses?.name} · {booking.service_name}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {saveError && <Text style={styles.errorInline}>{saveError}</Text>}

        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <PressableScale key={n} style={styles.starButton} onPress={() => setRating(n)}>
              <Star size={36} color={COLORS.star} fill={n <= rating ? COLORS.star : 'transparent'} strokeWidth={1.6} />
            </PressableScale>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Комментарий (необязательно)</Text>
        <TextInput
          style={styles.commentInput}
          placeholder="Что понравилось или что можно улучшить?"
          placeholderTextColor={COLORS.sub}
          multiline
          value={comment}
          onChangeText={setComment}
        />
      </ScrollView>

      <View style={styles.ctaBar}>
        <PressableScale style={[styles.ctaButton, (rating < 1 || saving) && styles.ctaButtonOff]} disabled={rating < 1 || saving} onPress={handleSubmit}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.ctaText}>{existingReview ? 'Сохранить' : 'Отправить отзыв'}</Text>}
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, padding: SPACING.xl, textAlign: 'center' },
  errorInline: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, marginBottom: SPACING.md },
  headerBar: { paddingTop: 52, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  backButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.ink, letterSpacing: -0.3 },
  sub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  body: { padding: SPACING.xl, paddingBottom: 120 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg, marginBottom: SPACING.xl },
  starButton: { padding: SPACING.xs },
  sectionLabel: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.md },
  commentInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    minHeight: 110,
    textAlignVertical: 'top',
    fontFamily: FONT.regular,
    fontSize: TEXT_SIZE.md,
    color: COLORS.text,
  },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingBottom: 26,
    backgroundColor: 'rgba(255,255,255,.94)',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  ctaButton: { height: 54, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  ctaButtonOff: { backgroundColor: '#E7E9F0' },
  ctaText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.white },
});
