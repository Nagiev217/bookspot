// «Мои отзывы» — из профиля (макет «Salon Booking App»). Отзывы клиента
// через его записи (client_id отзывов закрыт, 0036); тап — правка отзыва.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import StarBadge from '@/components/StarBadge';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { useAuthStore } from '@/utils/auth/store';
import { listMyReviews } from '@/utils/supabase/booking';
import { dayMonthShort } from '@/utils/i18n/dates';
import { t } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';

function formatDate(iso) {
  const d = new Date(new Date(iso).getTime() + 4 * 3600e3);
  return `${dayMonthShort(d.getUTCDate(), d.getUTCMonth())} ${d.getUTCFullYear()}`;
}

export default function MyReviews() {
  const uid = useAuthStore((s) => s.uid);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      let cancelled = false;
      listMyReviews(uid)
        .then((d) => !cancelled && setItems(d))
        .catch((e) => !cancelled && setError(friendlyError(e, t('common.20'))))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [uid])
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale style={styles.backButton} onPress={() => router.back()} accessibilityLabel={t('common.40')}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
        <Text style={styles.title}>{t('profile.myReviews')}</Text>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={COLORS.indigo} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{error || t('profile.noReviews')}</Text>}
          renderItem={({ item: b }) => (
            <PressableScale style={styles.card} onPress={() => router.push(`/review/${b.id}`)}>
              <View style={styles.cardHeader}>
                <Text style={styles.salon} numberOfLines={1}>
                  {b.businesses?.name}
                </Text>
                <StarBadge rating={b.review.rating} />
              </View>
              {b.review.comment ? <Text style={styles.comment}>{b.review.comment}</Text> : null}
              <Text style={styles.meta}>
                {b.service_name} · {formatDate(b.starts_at)}
              </Text>
            </PressableScale>
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
  card: { padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  salon: { flex: 1, fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  comment: { fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text, lineHeight: 20 },
  meta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub },
  empty: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, textAlign: 'center', marginTop: SPACING.lg },
});
