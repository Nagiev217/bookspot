// Страница салона — реальные данные из Supabase (businesses/services/masters).
// [idx] теперь принимает uuid бизнеса, а не индекс мок-массива.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Heart } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import PressableScale from '@/components/PressableScale';
import { getBusiness, listServices, listMasters } from '@/utils/supabase/catalog';
import { isFavorite, addFavorite, removeFavorite } from '@/utils/supabase/favorites';
import { useAuthStore } from '@/utils/auth/store';

export default function SalonDetail() {
  const { idx: businessId } = useLocalSearchParams();
  const uid = useAuthStore((s) => s.uid);
  const [business, setBusiness] = useState(null);
  const [services, setServices] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [favorite, setFavorite] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      Promise.all([getBusiness(businessId), listServices(businessId), listMasters(businessId), uid ? isFavorite(uid, businessId) : false])
        .then(([b, s, m, fav]) => {
          if (cancelled) return;
          setBusiness(b);
          setServices(s);
          setMasters(m);
          setFavorite(fav);
        })
        .catch((e) => !cancelled && setError(e.message || 'Не удалось загрузить салон'))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [businessId, uid])
  );

  async function toggleFavorite() {
    if (!uid || favBusy) return;
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
          <PressableScale style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={17} color={COLORS.ink} />
          </PressableScale>
          {uid && (
            <PressableScale style={styles.favButton} onPress={toggleFavorite}>
              <Heart size={18} color={favorite ? COLORS.danger : COLORS.ink} fill={favorite ? COLORS.danger : 'transparent'} />
            </PressableScale>
          )}
        </View>

        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name}>{business.name}</Text>
              <Text style={styles.meta}>
                {business.city}
                {business.district ? ` · ${business.district}` : ''}
              </Text>
            </View>
          </View>

          {business.phone && (
            <View style={styles.tagRow}>
              <Text style={styles.tag}>{business.phone}</Text>
            </View>
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
                  <View style={[styles.masterAvatar, { backgroundColor: tintFor(m.id)[0] }]} />
                  <Text style={styles.masterName}>{m.name}</Text>
                </View>
              ))}
            </ScrollView>
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
  meta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub, marginTop: 5 },
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
  masterAvatar: { width: 92, height: 92, borderRadius: RADIUS.lg },
  masterName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink, marginTop: 9 },
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
