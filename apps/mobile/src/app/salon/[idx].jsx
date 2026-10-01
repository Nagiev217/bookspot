// Страница салона — реальные данные из Supabase (businesses/services/masters).
// [idx] теперь принимает uuid бизнеса, а не индекс мок-массива.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Heart } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import PressableScale from '@/components/PressableScale';
import { getBusiness, listServices, listMasters } from '@/utils/supabase/catalog';
import { isFavorite, addFavorite, removeFavorite } from '@/utils/supabase/favorites';
import { listReviews } from '@/utils/supabase/reviews';
import { listBusinessPhotos } from '@/utils/supabase/business';
import { useAuthStore } from '@/utils/auth/store';
import StarBadge from '@/components/StarBadge';

// Азербайджан — UTC+4 без перехода на летнее время (та же ручная арифметика,
// что и в booking/[idx].jsx — надёжного доступа к базе IANA-таймзон на
// клиенте нет).
function formatReviewDate(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

// 1 отзыв, 2–4 отзыва, 5+ и 11–14 отзывов.
function reviewsLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} отзыв`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} отзыва`;
  return `${n} отзывов`;
}

export default function SalonDetail() {
  const { idx: businessId } = useLocalSearchParams();
  const uid = useAuthStore((s) => s.uid);
  const [business, setBusiness] = useState(null);
  const [services, setServices] = useState([]);
  const [masters, setMasters] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [favorite, setFavorite] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      Promise.all([
        getBusiness(businessId),
        listServices(businessId),
        listMasters(businessId),
        uid ? isFavorite(uid, businessId) : false,
        listReviews(businessId),
        listBusinessPhotos(businessId).catch(() => []),
      ])
        .then(([b, s, m, fav, rv, ph]) => {
          if (cancelled) return;
          setBusiness(b);
          setServices(s);
          setMasters(m);
          setFavorite(fav);
          setReviews(rv);
          setPhotos(ph);
        })
        .catch((e) => !cancelled && setError(e.message || 'Не удалось загрузить салон'))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [businessId, uid])
  );

  async function toggleFavorite() {
    if (favBusy) return;
    if (!uid) {
      router.push({ pathname: '/(auth)/login', params: { redirect: `/salon/${businessId}` } });
      return;
    }
    setFavBusy(true);
    const next = !favorite;
    setFavorite(next); // оптимистично — сердечко должно отвечать сразу
    try {
      if (next) await addFavorite(uid, businessId);
      else await removeFavorite(uid, businessId);
    } catch (e) {
      setFavorite(!next); // откат при ошибке сети/RLS
    } finally {
      setFavBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }
  if (error || !business) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Салон не найден'}</Text>
      </View>
    );
  }

  const tint = tintFor(business.id);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 104 }}>
        <View style={[styles.hero, { backgroundColor: tint[0] }]}>
          {/* Галерея салона (до 5 фото, 0024); старые салоны без строк в
              business_photos — по-прежнему одно фото logo_url. */}
          {photos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / screenWidth))}
            >
              {photos.map((p) => (
                <Image key={p.id} source={{ uri: p.url }} style={{ width: screenWidth, height: '100%' }} contentFit="cover" />
              ))}
            </ScrollView>
          ) : (
            business.logo_url && <Image source={{ uri: business.logo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          )}
          {photos.length > 1 && (
            <View style={styles.dots} pointerEvents="none">
              {photos.map((p, i) => (
                <View key={p.id} style={[styles.dot, i === photoIndex && styles.dotActive]} />
              ))}
            </View>
          )}
          <PressableScale style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={17} color={COLORS.ink} />
          </PressableScale>
          <PressableScale style={styles.favButton} onPress={toggleFavorite}>
            <Heart size={18} color={favorite ? COLORS.danger : COLORS.ink} fill={favorite ? COLORS.danger : 'transparent'} />
          </PressableScale>
        </View>

        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name}>{business.name}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  {business.city}
                  {business.district ? ` · ${business.district}` : ''}
                </Text>
                {business.review_count > 0 && (
                  <StarBadge rating={business.rating_avg} extra={reviewsLabel(business.review_count)} style={styles.ratingBadge} />
                )}
              </View>
            </View>
          </View>

          {business.phone && (
            <View style={styles.tagRow}>
              <Text style={styles.tag}>{business.phone}</Text>
            </View>
          )}

          {(business.description?.trim() || business.address) && (
            <>
              <Text style={styles.sectionTitle}>О салоне</Text>
              {business.description?.trim() ? <Text style={styles.about}>{business.description.trim()}</Text> : null}
              {business.address ? (
                <Text style={styles.address}>
                  {business.city}
                  {business.district ? `, ${business.district}` : ''}, {business.address}
                </Text>
              ) : null}
            </>
          )}

          <Text style={styles.sectionTitle}>Услуги</Text>
          {services.length === 0 ? (
            <Text style={styles.emptyText}>Пока нет услуг.</Text>
          ) : (
            <View style={{ gap: SPACING.sm }}>
              {services.map((v) => (
                <PressableScale
                  key={v.id}
                  style={styles.serviceRow}
                  onPress={() => router.push({ pathname: `/booking/${business.id}`, params: { serviceId: v.id } })}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.serviceName}>{v.name}</Text>
                    <Text style={styles.serviceDur}>{v.duration_min} мин</Text>
                  </View>
                  <Text style={styles.servicePrice}>{v.price} ₼</Text>
                </PressableScale>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Мастера</Text>
          {masters.length === 0 ? (
            <Text style={styles.emptyText}>Пока нет мастеров.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.md }}>
              {masters.map((m) => (
                <View key={m.id} style={styles.masterCard}>
                  <View style={[styles.masterAvatar, { backgroundColor: tintFor(m.id)[0] }]}>
                    {m.photo_url && <Image source={{ uri: m.photo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                  </View>
                  <Text style={styles.masterName}>{m.name}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Text style={styles.sectionTitle}>Отзывы</Text>
          {reviews.length === 0 ? (
            <Text style={styles.emptyText}>Отзывов пока нет — станьте первым!</Text>
          ) : (
            <View style={{ gap: SPACING.sm }}>
              {reviews.map((r) => (
                <View key={r.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewName}>{r.client_name}</Text>
                    <StarBadge rating={r.rating} />
                  </View>
                  {r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
                  <Text style={styles.reviewDate}>{formatReviewDate(r.created_at)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.ctaBar}>
        <PressableScale
          style={[styles.ctaButton, services.length === 0 && styles.ctaButtonOff]}
          disabled={services.length === 0}
          onPress={() => router.push(`/booking/${business.id}`)}
        >
          <Text style={styles.ctaText}>Записаться</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, padding: SPACING.xl, textAlign: 'center' },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.md },
  hero: { height: 240 },
  dots: { position: 'absolute', bottom: 34, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.55)' },
  dotActive: { width: 18, backgroundColor: COLORS.white },
  about: { fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: '#3A4256', lineHeight: 21 },
  address: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: SPACING.sm },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 52,
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favButton: {
    position: 'absolute',
    right: 20,
    top: 52,
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { marginTop: -26, backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.md },
  name: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xl, color: COLORS.ink, letterSpacing: -0.6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 5 },
  meta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub },
  ratingBadge: { paddingLeft: SPACING.sm, borderLeftWidth: 1, borderLeftColor: COLORS.border },
  tagRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  tag: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: '#3A4256', backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, paddingVertical: 9, paddingHorizontal: 12 },
  sectionTitle: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.ink, letterSpacing: -0.3, marginTop: SPACING.xxl, marginBottom: SPACING.md },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
  },
  serviceName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  serviceDur: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  servicePrice: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  masterCard: { width: 92, alignItems: 'center' },
  masterAvatar: { width: 92, height: 92, borderRadius: RADIUS.lg, overflow: 'hidden' },
  masterName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink, marginTop: 9 },
  reviewCard: { padding: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, gap: 6 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  reviewComment: { fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text, lineHeight: 20 },
  reviewDate: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.subLight },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.md,
    paddingBottom: 26,
    paddingHorizontal: SPACING.xl,
    backgroundColor: 'rgba(255,255,255,.94)',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  ctaButton: {
    height: 54,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonOff: { backgroundColor: '#E7E9F0' },
  ctaText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.white },
});
