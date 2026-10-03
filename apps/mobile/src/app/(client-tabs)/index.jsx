// Главная: категории, «Недавно просмотренные» (на устройстве, utils/recent),
// «Поблизости» (по геолокации, салоны в радиусе NEARBY_KM с отметкой на
// карте — 0032) и все салоны каталога.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Linking } from 'react-native';
import { Image } from 'expo-image';
import PressableScale from '@/components/PressableScale';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { Search, MapPin } from 'lucide-react-native';
import * as Location from 'expo-location';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { iconFor } from '@/data/categoryIcons';
import { tintFor } from '@/utils/tint';
import { listCategories, listBusinesses } from '@/utils/supabase/catalog';
import { useReducedMotion } from '@/utils/useReducedMotion';
import { t, categoryName } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';
import { hasLocation, distanceKm, formatDistance } from '@/utils/maps';
import { getRecentSalons } from '@/utils/recent';

const NEARBY_KM = 15;

function SalonCard({ b, distance, compact, index, reducedMotion }) {
  return (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(220).delay(index * 30)}>
      <PressableScale
        style={({ pressed }) => [compact ? styles.compactCard : styles.brandCard, pressed && styles.cardPressed]}
        onPress={() => router.push(`/salon/${b.id}`)}
      >
        <View style={[compact ? styles.compactPhoto : styles.brandPhoto, { backgroundColor: tintFor(b.id)[0] }]}>
          {b.logo_url ? (
            <Image source={{ uri: b.logo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <Text style={styles.photoLabel}>{t('common.44')}</Text>
          )}
          {distance !== null && (
            <View style={styles.distanceBadge}>
              <MapPin size={11} color={COLORS.ink} />
              <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.brandName} numberOfLines={1}>
          {b.name}
        </Text>
        <Text style={styles.brandMeta} numberOfLines={1}>
          {b.city}
          {b.district ? ` · ${b.district}` : ''}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [recentIds, setRecentIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userLoc, setUserLoc] = useState(null);
  // 'unknown' | 'granted' | 'ask' (можно спросить) | 'denied' (только через настройки)
  const [locPerm, setLocPerm] = useState('unknown');
  const [locating, setLocating] = useState(false);
  const reducedMotion = useReducedMotion();

  const readPosition = useCallback(async () => {
    const pos = (await Location.getLastKnownPositionAsync()) || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    if (pos) setUserLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
  }, []);

  // Без запроса: если разрешение уже есть — сразу считаем «Поблизости».
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (p.granted) {
          setLocPerm('granted');
          return readPosition();
        }
        setLocPerm(p.canAskAgain === false ? 'denied' : 'ask');
      })
      .catch(() => setLocPerm('ask'));
  }, [readPosition]);

  async function enableLocation() {
    if (locPerm === 'denied') {
      Linking.openSettings().catch(() => {});
      return;
    }
    setLocating(true);
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.granted) {
        setLocPerm('granted');
        await readPosition();
      } else {
        setLocPerm(p.canAskAgain === false ? 'denied' : 'ask');
      }
    } catch {
    } finally {
      setLocating(false);
    }
  }

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cats, biz, recent] = await Promise.all([listCategories(), listBusinesses(), getRecentSalons()]);
      setCategories(cats);
      setBusinesses(biz);
      setRecentIds(recent);
    } catch (e) {
      setError(friendlyError(e, t('client_tabs_index.1')));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const distanceOf = (b) => (userLoc && hasLocation(b) ? distanceKm(userLoc, { latitude: b.lat, longitude: b.lng }) : null);
  // Каталог отдаёт только видимые салоны — скрытые и заблокированные из
  // «недавних» пропадают сами.
  const byId = new Map(businesses.map((b) => [b.id, b]));
  const recent = recentIds.map((id) => byId.get(id)).filter(Boolean);
  const nearby = userLoc
    ? businesses
        .map((b) => ({ b, d: distanceOf(b) }))
        .filter((x) => x.d !== null && x.d <= NEARBY_KM)
        .sort((a, b) => a.d - b.d)
    : [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: SPACING.xxl }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.indigo} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.location}>{t('common.1')}</Text>
          <Text style={styles.title}>
            {t('client_tabs_index.2')}
            {'\n'}
            {t('client_tabs_index.3')}
          </Text>
        </View>
        <View style={styles.avatarPlaceholder} />
      </View>

      <PressableScale style={styles.searchBar} onPress={() => router.push('/(client-tabs)/search')}>
        <Search size={18} color={COLORS.sub} />
        <Text style={styles.searchPlaceholder}>{t('common.45')}</Text>
      </PressableScale>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {loading && categories.length === 0 ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={COLORS.indigo} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {categories.map((c) => {
              const Icon = iconFor(c.id);
              return (
                <PressableScale
                  key={c.id}
                  style={styles.catItem}
                  onPress={() => router.push({ pathname: '/(client-tabs)/search', params: { categoryId: c.id, title: categoryName(c) } })}
                >
                  <View style={styles.catIcon}>
                    <Icon size={24} color={COLORS.indigo} strokeWidth={1.6} />
                  </View>
                  <Text style={styles.catName}>{categoryName(c)}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          {recent.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('home.recent')}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandRow}>
                {recent.map((b, i) => (
                  <SalonCard key={b.id} b={b} distance={distanceOf(b)} compact index={i} reducedMotion={reducedMotion} />
                ))}
              </ScrollView>
            </>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('home.nearby')}</Text>
            {nearby.length > 0 && (
              <PressableScale onPress={() => router.push({ pathname: '/(client-tabs)/search', params: { title: t('home.nearby'), map: '1' } })}>
                <Text style={styles.sectionLink}>{t('map.map')}</Text>
              </PressableScale>
            )}
          </View>
          {locPerm === 'granted' ? (
            !userLoc ? (
              <ActivityIndicator style={{ marginBottom: SPACING.xxl }} color={COLORS.indigo} />
            ) : nearby.length === 0 ? (
              <Text style={[styles.emptyText, { marginBottom: SPACING.xxl }]}>{t('home.nearbyEmpty', { km: NEARBY_KM })}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandRow}>
                {nearby.map(({ b, d }, i) => (
                  <SalonCard key={b.id} b={b} distance={d} index={i} reducedMotion={reducedMotion} />
                ))}
              </ScrollView>
            )
          ) : locPerm !== 'unknown' ? (
            <View style={styles.locCard}>
              <MapPin size={22} color={COLORS.indigo} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.locTitle}>{t('home.nearbyTitle')}</Text>
                <Text style={styles.locText}>{locPerm === 'denied' ? t('home.locDenied') : t('home.locAsk')}</Text>
              </View>
              <PressableScale style={styles.locButton} onPress={enableLocation} disabled={locating}>
                {locating ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.locButtonText}>{locPerm === 'denied' ? t('home.openSettings') : t('home.allow')}</Text>
                )}
              </PressableScale>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('common.13')}</Text>
            <PressableScale onPress={() => router.push({ pathname: '/(client-tabs)/search', params: { title: t('common.46') } })}>
              <Text style={styles.sectionLink}>{t('client_tabs_index.4')}</Text>
            </PressableScale>
          </View>

          {businesses.length === 0 ? (
            <Text style={styles.emptyText}>{t('client_tabs_index.5')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandRow}>
              {businesses.map((b, i) => (
                <SalonCard key={b.id} b={b} distance={distanceOf(b)} index={i} reducedMotion={reducedMotion} />
              ))}
            </ScrollView>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingTop: 56,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  location: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, letterSpacing: 0.2 },
  title: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xxl, color: COLORS.ink, letterSpacing: -0.6, marginTop: 6, lineHeight: 32 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  searchBar: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    height: 50,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
  },
  searchPlaceholder: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, marginTop: SPACING.md, marginHorizontal: SPACING.xl },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginHorizontal: SPACING.xl },
  catRow: { gap: SPACING.sm, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg },
  catItem: { width: 74, alignItems: 'center', gap: SPACING.sm },
  catIcon: { width: 62, height: 62, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  catName: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.xs, color: '#3A4256', textAlign: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  sectionTitle: { fontFamily: FONT.bold, fontSize: 17, color: COLORS.ink, letterSpacing: -0.3 },
  sectionLink: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.indigo },
  brandRow: { gap: SPACING.md, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  brandCard: { width: 238 },
  compactCard: { width: 150 },
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  brandPhoto: { height: 150, borderRadius: RADIUS.lg, overflow: 'hidden' },
  compactPhoto: { height: 100, borderRadius: RADIUS.md, overflow: 'hidden' },
  photoLabel: { position: 'absolute', right: 12, bottom: 10, fontFamily: FONT.semibold, fontSize: 10, color: 'rgba(11,17,32,.32)', letterSpacing: 1 },
  distanceBadge: {
    position: 'absolute',
    left: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,.94)',
  },
  distanceText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.xs, color: COLORS.ink },
  brandName: { fontFamily: FONT.bold, fontSize: 15, color: COLORS.ink, marginTop: 11, letterSpacing: -0.2 },
  brandMeta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  locCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xxl,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.indigo100,
  },
  locTitle: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  locText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  locButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: RADIUS.sm, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  locButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
});
