// Отзывы о салоне — для владельца (все) и мастера со своим логином (только
// о нём). Вверху средняя оценка и распределение по звёздам, ниже список.
// Ответить на отзыв нельзя — так задумано (без переписки в отзывах).
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import StarBadge from '@/components/StarBadge';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { useAuthStore } from '@/utils/auth/store';
import { listBusinessReviews } from '@/utils/supabase/business';
import { dayMonthShort } from '@/utils/i18n/dates';
import { t, tn } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';

function formatDate(iso) {
  const d = new Date(new Date(iso).getTime() + 4 * 3600e3);
  return `${dayMonthShort(d.getUTCDate(), d.getUTCMonth())} ${d.getUTCFullYear()}`;
}

export default function BusinessReviews() {
  const { businessId } = useLocalSearchParams();
  const staffMasterId = useAuthStore((s) => (s.role === 'staff' ? s.masterId : null));
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    return listBusinessReviews(businessId, staffMasterId)
      .then(setReviews)
      .catch((e) => setError(friendlyError(e, t('common.20'))))
      .finally(() => setLoading(false));
  }, [businessId, staffMasterId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  const byStars = [5, 4, 3, 2, 1].map((n) => ({ n, c: reviews.filter((r) => r.rating === n).length }));

  const header = (
    <View style={styles.summary}>
      <View style={styles.avgBox}>
        <Text style={styles.avg}>{count ? avg.toFixed(1) : '—'}</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} size={14} color={COLORS.star} fill={i <= Math.round(avg) ? COLORS.star : 'transparent'} />
          ))}
        </View>
        <Text style={styles.count}>{tn('plural.reviews', count)}</Text>
      </View>
      <View style={styles.bars}>
        {byStars.map(({ n, c }) => (
          <View key={n} style={styles.barRow}>
            <Text style={styles.barLabel}>{n}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: count ? `${(c / count) * 100}%` : '0%' }]} />
            </View>
            <Text style={styles.barCount}>{c}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale style={styles.backButton} onPress={() => router.back()} accessibilityLabel={t('common.40')}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
        <Text style={styles.title}>{t('common.73')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={COLORS.indigo} />
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.indigo} />}
          ListEmptyComponent={<Text style={styles.empty}>{error || t('reviews.emptyBusiness')}</Text>}
          renderItem={({ item: r }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.name} numberOfLines={1}>
                  {r.client_name}
                </Text>
                <StarBadge rating={r.rating} />
              </View>
              {r.comment ? <Text style={styles.comment}>{r.comment}</Text> : null}
              <Text style={styles.meta}>
                {[r.bookings?.service_name, staffMasterId ? null : r.masters?.name, formatDate(r.created_at)].filter(Boolean).join(' · ')}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  backButton: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, letterSpacing: -0.4 },
  list: { padding: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.sm },
  summary: { flexDirection: 'row', gap: SPACING.xl, padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: COLORS.surfaceAlt, marginBottom: SPACING.md },
  avgBox: { alignItems: 'center', justifyContent: 'center', minWidth: 90 },
  avg: { fontFamily: FONT.extrabold, fontSize: 36, color: COLORS.ink, letterSpacing: -1 },
  starsRow: { flexDirection: 'row', gap: 2, marginTop: 4 },
  count: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub, marginTop: 6 },
  bars: { flex: 1, justifyContent: 'center', gap: 5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  barLabel: { width: 12, fontFamily: FONT.semibold, fontSize: TEXT_SIZE.xs, color: COLORS.sub },
  barTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: COLORS.border, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.star },
  barCount: { width: 24, textAlign: 'right', fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub },
  card: { padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  name: { flex: 1, fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  comment: { fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text, lineHeight: 20 },
  meta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub },
  empty: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, textAlign: 'center', marginTop: SPACING.lg },
});
