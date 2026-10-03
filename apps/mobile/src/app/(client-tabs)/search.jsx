// Список салонов — реальные данные из Supabase. Кнопка «Карта» (по макету)
// показывает над списком карту с метками «от N ₼»; салоны без отметки на
// карте (0032) остаются только в списке. Если пользователь разрешил
// геолокацию, список сортируется по расстоянию и показывает его.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import PressableScale from '@/components/PressableScale';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { Search as SearchIcon, Map as MapIcon, List as ListIcon } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import { searchBusinesses } from '@/utils/supabase/catalog';
import { useReducedMotion } from '@/utils/useReducedMotion';
import { t, tn } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';
import { BAKU, hasLocation, distanceKm, formatDistance } from '@/utils/maps';

// Минимальная цена активной услуги салона — для «от N ₼».
function minPrice(b) {
  const prices = (b.services || []).filter((x) => x.active).map((x) => Number(x.price));
  return prices.length ? Math.min(...prices) : null;
}

export default function Search() {
  const { title, categoryId, q: initialQuery, map: openMap } = useLocalSearchParams();
  const [query, setQuery] = useState(initialQuery || '');
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);
  const reducedMotion = useReducedMotion();
  // «Карта» из «Поблизости» на главной открывает поиск сразу в режиме карты.
  const [mapMode, setMapMode] = useState(openMap === '1');
  const [userLoc, setUserLoc] = useState(null);
  const mapRef = useRef(null);

  // Геолокация без запроса разрешения: если уже разрешена — сортируем по
  // расстоянию сразу. Запрос разрешения — только при переходе на карту.
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => pos && setUserLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
      .catch(() => {});
  }, []);

  async function toggleMap() {
    const next = !mapMode;
    setMapMode(next);
    if (next && !userLoc) {
      try {
        const p = await Location.requestForegroundPermissionsAsync();
        if (!p.granted) return;
        const pos = (await Location.getLastKnownPositionAsync()) || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (pos) setUserLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {}
    }
  }

  const runSearch = useCallback(
    (signal) => {
      // Спиннер на весь экран — только при самом первом открытии. При
      // повторном фокусе или наборе текста список остаётся на месте, пока
      // грузятся свежие данные — иначе каждое нажатие клавиши и каждое
      // переключение вкладки мигает пустым экраном.
      if (!loadedOnce.current) setLoading(true);
      setError(null);
      searchBusinesses(query, { categoryId: categoryId || undefined })
        .then((data) => {
          if (signal.cancelled) return;
          setBusinesses(data);
          loadedOnce.current = true;
        })
        .catch((e) => !signal.cancelled && setError(friendlyError(e, t('client_tabs_search.1'))))
        .finally(() => !signal.cancelled && setLoading(false));
    },
    [query, categoryId]
  );

  // При каждом фокусе экрана — сразу; при вводе текста — через 300мс,
  // чтобы не слать запрос на каждую букву.
  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      runSearch(signal);
      return () => {
        signal.cancelled = true;
      };
    }, [runSearch])
  );
  useEffect(() => {
    const signal = { cancelled: false };
    const t = setTimeout(() => runSearch(signal), 300);
    return () => {
      signal.cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const located = businesses.filter(hasLocation);
  const distanceOf = (b) => (userLoc && hasLocation(b) ? distanceKm(userLoc, { latitude: b.lat, longitude: b.lng }) : null);
  const sorted = userLoc
    ? [...businesses].sort((a, b) => (distanceOf(a) ?? Infinity) - (distanceOf(b) ?? Infinity))
    : businesses;

  // Карта охватывает все метки (и пользователя, если известен).
  function fitMap() {
    const coords = located.map((b) => ({ latitude: b.lat, longitude: b.lng }));
    if (userLoc) coords.push(userLoc);
    if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: false });
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { flex: 1 }]}>{title || t('common.46')}</Text>
          <PressableScale style={styles.mapToggle} onPress={toggleMap}>
            {mapMode ? <ListIcon size={15} color={COLORS.white} /> : <MapIcon size={15} color={COLORS.white} />}
            <Text style={styles.mapToggleText}>{mapMode ? t('map.list') : t('map.map')}</Text>
          </PressableScale>
        </View>
        <View style={styles.searchBar}>
          <SearchIcon size={16} color={COLORS.sub} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('common.45')}
            placeholderTextColor={COLORS.sub}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
        <Text style={styles.count}>{tn('plural.salons', businesses.length)} · {t('common.1')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={COLORS.indigo} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {mapMode && (
            <View style={styles.mapBox}>
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                initialRegion={{ ...(located[0] ? { latitude: located[0].lat, longitude: located[0].lng } : BAKU), latitudeDelta: 0.08, longitudeDelta: 0.08 }}
                onMapReady={fitMap}
                showsUserLocation={!!userLoc}
                toolbarEnabled={false}
              >
                {located.map((b) => {
                  const price = minPrice(b);
                  return (
                    <Marker
                      key={b.id}
                      coordinate={{ latitude: b.lat, longitude: b.lng }}
                      onPress={() => router.push(`/salon/${b.id}`)}
                      accessibilityLabel={b.name}
                    >
                      <View style={styles.pricePin}>
                        <Text style={styles.pricePinText} numberOfLines={1}>
                          {price !== null ? t('map.priceFrom', { price }) : b.name}
                        </Text>
                      </View>
                    </Marker>
                  );
                })}
              </MapView>
              {located.length === 0 && (
                <View style={styles.mapEmpty} pointerEvents="none">
                  <Text style={styles.mapEmptyText}>{t('map.noneOnMap')}</Text>
                </View>
              )}
            </View>
          )}
          {businesses.length === 0 ? (
            <Text style={styles.emptyText}>{t('client_tabs_search.3')}</Text>
          ) : (
            sorted.map((b, i) => (
              <Animated.View key={b.id} entering={reducedMotion ? undefined : FadeIn.duration(220).delay(i * 30)}>
              <PressableScale style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={() => router.push(`/salon/${b.id}`)}>
                <View style={[styles.photo, { backgroundColor: tintFor(b.id)[0] }]}>
                  {b.logo_url ? (
                    <Image source={{ uri: b.logo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Text style={styles.photoLabel}>{t('common.44')}</Text>
                  )}
                </View>
                <View style={styles.cardRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardName}>{b.name}</Text>
                    <Text style={styles.cardMeta}>
                      {b.city}
                      {b.district ? ` · ${b.district}` : ''}
                      {distanceOf(b) !== null ? ` · ${formatDistance(distanceOf(b))}` : ''}
                    </Text>
                  </View>
                  {minPrice(b) !== null && <Text style={styles.cardPrice}>{t('map.priceFrom', { price: minPrice(b) })}</Text>}
                </View>
              </PressableScale>
              </Animated.View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  headerBar: {
    paddingTop: 56,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  title: { fontFamily: FONT.bold, fontSize: 17, color: COLORS.ink, letterSpacing: -0.3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  mapToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 13, borderRadius: 13, backgroundColor: COLORS.ink },
  mapToggleText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
  mapBox: { height: 300, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.surface },
  mapEmpty: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, backgroundColor: 'rgba(255,255,255,.7)' },
  mapEmptyText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.ink, textAlign: 'center' },
  pricePin: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 11, backgroundColor: COLORS.indigo, maxWidth: 160 },
  pricePinText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
  cardPrice: { fontFamily: FONT.bold, fontSize: 13, color: COLORS.ink },
  searchBar: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    height: 44,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
  },
  searchInput: { flex: 1, fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.text, padding: 0 },
  count: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: SPACING.sm },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, margin: SPACING.xl },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  list: { padding: SPACING.xl, gap: SPACING.md },
  card: {},
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  photo: { height: 168, borderRadius: RADIUS.xl, overflow: 'hidden' },
  photoLabel: { position: 'absolute', right: 12, bottom: 10, fontFamily: FONT.semibold, fontSize: 10, color: 'rgba(11,17,32,.3)', letterSpacing: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.md, paddingTop: 11 },
  cardName: { fontFamily: FONT.bold, fontSize: 15.5, color: COLORS.ink, letterSpacing: -0.2 },
  cardMeta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
});
