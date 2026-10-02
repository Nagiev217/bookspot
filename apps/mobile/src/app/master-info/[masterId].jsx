// Страница мастера для клиента — перенесена с макета «Salon Booking App»
// (экран isMaster): фото-обложка 400px, шапка с именем и рейтингом, чипы
// «Опыт N лет» и «N отзывов», «О себе», услуги мастера и закреплённая внизу
// кнопка «Записаться к мастеру». Данные настоящие: bio/specialty из 0026 и
// 0028, рейтинг и отзывы — по визитам к этому мастеру.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import StarBadge from '@/components/StarBadge';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import { getMasterPublic, listMasterServices, listMasterReviews, getBusiness } from '@/utils/supabase/catalog';
import { t, tn } from '@/utils/i18n';

function formatReviewDate(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

// 1 отзыв, 2–4 отзыва, 5+ и 11–14 отзывов.
const reviewsLabel = (n) => tn('plural.reviews', n);

const yearsLabel = (n) => tn('plural.years', n);

export default function MasterInfo() {
  const { masterId } = useLocalSearchParams();
  const [master, setMaster] = useState(null);
  const [business, setBusiness] = useState(null);
  const [services, setServices] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getMasterPublic(masterId)
        .then(async (m) => {
          // Салон, услуги и отзывы — после мастера: business_id берём из него.
          const [s, r, b] = await Promise.all([
            listMasterServices(masterId),
            listMasterReviews(masterId),
            getBusiness(m.business_id).catch(() => null),
          ]);
          if (cancelled) return;
          setMaster(m);
          setServices(s);
          setReviews(r);
          setBusiness(b);
        })
        .catch((e) => !cancelled && setError(friendlyError(e, t('master_info_masterId.7'))))
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
        <Text style={styles.errorText}>{error || t('master_info_masterId.8')}</Text>
      </View>
    );
  }

  const rating = reviews.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : null;
  const subtitle = [master.specialty?.trim(), business?.name].filter(Boolean).join(' · ');
  const canBook = master.active && services.length > 0;

  function book(serviceId) {
    router.push({ pathname: `/booking/${master.business_id}`, params: { serviceId, masterId: master.id } });
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: canBook ? 104 : SPACING.xxl }}>
        {/* Обложка: фото мастера во всю ширину, как в макете. */}
        <View style={[styles.hero, { backgroundColor: tintFor(master.id)[0] }]}>
          {master.photo_url && <Image source={{ uri: master.photo_url }} style={styles.heroImg} contentFit="cover" />}
          <PressableScale style={styles.backButton} onPress={() => router.back()} accessibilityLabel={t('common.40')}>
            <ArrowLeft size={17} color={COLORS.ink} />
          </PressableScale>
        </View>

        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name}>{master.name}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {rating !== null && (
              <View style={styles.ratingBadge}>
                <Star size={12} color={COLORS.star} fill={COLORS.star} />
                <Text style={styles.ratingText}>{rating}</Text>
              </View>
            )}
          </View>

          {(master.experience_years !== null || reviews.length > 0) && (
            <View style={styles.chipRow}>
              {master.experience_years !== null && (
                <Text style={styles.chip}>{t('master_info_masterId.9')}{' '}{yearsLabel(master.experience_years)}</Text>
              )}
              {reviews.length > 0 && <Text style={styles.chip}>{reviewsLabel(reviews.length)}</Text>}
            </View>
          )}

          {master.bio?.trim() ? (
            <>
              <Text style={styles.sectionTitle}>{t('common.71')}</Text>
              <Text style={styles.about}>{master.bio.trim()}</Text>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>{t('common.48')}</Text>
          {!master.active ? (
            <Text style={styles.emptyText}>{t('master_info_masterId.10')}</Text>
          ) : services.length === 0 ? (
            <Text style={styles.emptyText}>{t('common.72')}</Text>
          ) : (
            <View style={{ gap: SPACING.sm }}>
              {services.map((s) => (
                <PressableScale key={s.id} style={styles.serviceRow} onPress={() => book(s.id)}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.serviceName}>{s.name}</Text>
                    <Text style={styles.serviceDur}>{s.duration_min}{' '}{t('common.55')}</Text>
                  </View>
                  <Text style={styles.servicePrice}>{s.price} ₼</Text>
                </PressableScale>
              ))}
            </View>
          )}

          {reviews.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>{t('common.73')}</Text>
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
        </View>
      </ScrollView>

      {canBook && (
        <View style={styles.ctaBar}>
          <PressableScale style={styles.ctaButton} onPress={() => book(services[0].id)}>
            <Text style={styles.ctaText}>{t('master_info_masterId.11')}</Text>
          </PressableScale>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, padding: SPACING.xl, textAlign: 'center' },
  hero: { height: 400 },
  heroImg: { width: '100%', height: '100%' },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 52,
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { marginTop: -26, backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  name: { fontFamily: FONT.extrabold, fontSize: 24, color: COLORS.ink, letterSpacing: -0.7 },
  subtitle: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 5 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 11, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface },
  ratingText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.lg },
  chip: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: '#3A4256', backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, paddingVertical: 9, paddingHorizontal: 12, overflow: 'hidden' },
  sectionTitle: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.ink, letterSpacing: -0.3, marginTop: SPACING.xxl, marginBottom: SPACING.md },
  about: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: '#3A4256', lineHeight: 22 },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md },
  serviceName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  serviceDur: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  servicePrice: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
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
    paddingTop: 14,
    paddingHorizontal: SPACING.xl,
    paddingBottom: 26,
    backgroundColor: 'rgba(255,255,255,.94)',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  ctaButton: { height: 54, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.white },
});
