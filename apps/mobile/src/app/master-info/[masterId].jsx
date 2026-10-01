// Страница мастера для клиента: фото, «о себе» (0026), услуги мастера с
// записью в один тап и отзывы о визитах к нему. Открывается тапом по
// мастеру в карточке салона.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import StarBadge from '@/components/StarBadge';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import { getMasterPublic, listMasterServices, listMasterReviews } from '@/utils/supabase/catalog';

function formatReviewDate(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

function reviewsLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} отзыв`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} отзыва`;
  return `${n} отзывов`;
}

export default function MasterInfo() {
  const { masterId } = useLocalSearchParams();
  const [master, setMaster] = useState(null);
  const [services, setServices] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getMasterPublic(masterId), listMasterServices(masterId), listMasterReviews(masterId)])
        .then(([m, s, r]) => {
          if (cancelled) return;
          setMaster(m);
          setServices(s);
          setReviews(r);
        })
        .catch((e) => !cancelled && setError(e.message || 'Не удалось загрузить мастера'))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [masterId])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }
  if (error || !master) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Мастер не найден'}</Text>
      </View>
    );
  }

  const rating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  function book(serviceId) {
    router.push({ pathname: `/booking/${master.business_id}`, params: { serviceId, masterId: master.id } });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Назад">
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.avatar, { backgroundColor: tintFor(master.id)[0] }]}>
          {master.photo_url && <Image source={{ uri: master.photo_url }} style={styles.avatarImg} contentFit="cover" />}
        </View>
        <Text style={styles.name}>{master.name}</Text>
        {rating !== null && (
          <View style={styles.ratingRow}>
            <StarBadge rating={rating.toFixed(1)} extra={reviewsLabel(reviews.length)} />
          </View>
        )}

        {master.bio?.trim() ? (
          <>
            <Text style={styles.sectionTitle}>О себе</Text>
            <Text style={styles.bio}>{master.bio.trim()}</Text>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Услуги</Text>
        {!master.active ? (
          <Text style={styles.emptyText}>Мастер сейчас не принимает записи.</Text>
        ) : services.length === 0 ? (
          <Text style={styles.emptyText}>Пока нет услуг.</Text>
        ) : (
          <View style={{ gap: SPACING.sm }}>
            {services.map((s) => (
              <PressableScale key={s.id} style={styles.serviceRow} onPress={() => book(s.id)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.serviceName}>{s.name}</Text>
                  <Text style={styles.serviceDur}>{s.duration_min} мин</Text>
                </View>
                <Text style={styles.servicePrice}>{s.price} ₼</Text>
              </PressableScale>
            ))}
          </View>
        )}

        {reviews.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Отзывы</Text>
            <View style={{ gap: SPACING.sm }}>
              {reviews.slice(0, 10).map((r) => (
                <View key={r.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewName}>{r.client_name}</Text>
                    <StarBadge rating={r.rating} />
                  </View>
                  {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                  <Text style={styles.reviewDate}>{formatReviewDate(r.created_at)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, padding: SPACING.xl, textAlign: 'center' },
  header: { paddingTop: 56, paddingHorizontal: SPACING.xl },
  backButton: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: 48 },
  avatar: { alignSelf: 'center', width: 132, height: 132, borderRadius: 66, overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  name: { alignSelf: 'center', fontFamily: FONT.extrabold, fontSize: 24, color: COLORS.ink, letterSpacing: -0.5, marginTop: SPACING.md },
  ratingRow: { alignSelf: 'center', marginTop: SPACING.sm },
  sectionTitle: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.ink, letterSpacing: -0.3, marginTop: SPACING.xxl, marginBottom: SPACING.md },
  bio: { fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: '#3A4256', lineHeight: 21 },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceAlt },
  serviceName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  serviceDur: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  servicePrice: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.indigo },
  reviewCard: { padding: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, gap: 6 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  reviewComment: { fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text, lineHeight: 20 },
  reviewDate: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.subLight },
});
