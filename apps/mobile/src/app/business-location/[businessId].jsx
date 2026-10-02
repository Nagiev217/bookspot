// Владелец отмечает салон на карте (0032). Метка всегда в центре экрана —
// двигается карта, а не метка: так точнее, чем перетаскивать маркер пальцем.
// Найти место можно поиском по адресу или кнопкой «Моё местоположение»
// (если владелец сейчас в салоне). Под картой — адрес, который система
// определила по точке; если текстовый адрес салона пуст, сохраним его.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, Alert, Keyboard } from 'react-native';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, MapPin, LocateFixed, Search } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { getMyBusiness, updateBusiness } from '@/utils/supabase/business';
import { BAKU, hasLocation } from '@/utils/maps';
import { t } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';

const ZOOM = { latitudeDelta: 0.008, longitudeDelta: 0.008 };

function formatAddress(a) {
  if (!a) return '';
  const street = [a.street, a.streetNumber].filter(Boolean).join(' ');
  return [street || a.name, a.district, a.city].filter(Boolean).join(', ');
}

export default function BusinessLocation() {
  const { businessId } = useLocalSearchParams();
  const mapRef = useRef(null);
  const [business, setBusiness] = useState(null);
  const [center, setCenter] = useState(null);
  const [query, setQuery] = useState('');
  const [detected, setDetected] = useState('');
  const [busy, setBusy] = useState(null); // 'search' | 'locate' | 'save'
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getMyBusiness(businessId)
        .then((b) => {
          if (cancelled) return;
          setBusiness(b);
          setCenter(hasLocation(b) ? { latitude: b.lat, longitude: b.lng } : BAKU);
          setQuery(b.address || '');
        })
        .catch((e) => !cancelled && setError(friendlyError(e, t('common.20'))));
      return () => {
        cancelled = true;
      };
    }, [businessId])
  );

  // Адрес под меткой — после каждой остановки карты.
  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    Location.reverseGeocodeAsync(center)
      .then((r) => !cancelled && setDetected(formatAddress(r?.[0])))
      .catch(() => !cancelled && setDetected(''));
    return () => {
      cancelled = true;
    };
  }, [center]);

  function moveTo(coord) {
    setCenter(coord);
    mapRef.current?.animateToRegion({ ...coord, ...ZOOM }, 400);
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    setBusy('search');
    setError(null);
    try {
      // Город в запросе сильно повышает точность для коротких адресов.
      const city = business?.city || t('common.1');
      const found = await Location.geocodeAsync(q.toLowerCase().includes(city.toLowerCase()) ? q : `${q}, ${city}`);
      if (found?.[0]) moveTo({ latitude: found[0].latitude, longitude: found[0].longitude });
      else setError(t('map.notFound'));
    } catch {
      setError(t('map.notFound'));
    } finally {
      setBusy(null);
    }
  }

  async function handleLocate() {
    setBusy('locate');
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setError(t('map.noPermission'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      moveTo({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      setError(t('map.locateFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    setBusy('save');
    setError(null);
    try {
      const patch = { lat: center.latitude, lng: center.longitude };
      if (!business.address && detected) patch.address = detected;
      await updateBusiness(businessId, patch);
      Alert.alert(t('map.saved'), detected || '', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      setError(friendlyError(e, t('common.65')));
    } finally {
      setBusy(null);
    }
  }

  if (!center) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={COLORS.indigo} />}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...center, ...ZOOM }}
        onRegionChangeComplete={(r) => setCenter({ latitude: r.latitude, longitude: r.longitude })}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      />

      {/* Метка в центре: кончик иглы — ровно в точке, которую сохраним. */}
      <View pointerEvents="none" style={styles.pinWrap}>
        <MapPin size={40} color={COLORS.indigo} fill={COLORS.white} strokeWidth={2.2} />
      </View>

      <View style={styles.top}>
        <PressableScale style={styles.iconButton} onPress={() => router.back()} accessibilityLabel={t('common.40')}>
          <ArrowLeft size={18} color={COLORS.ink} />
        </PressableScale>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('map.searchPlaceholder')}
            placeholderTextColor={COLORS.sub}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <PressableScale style={styles.searchButton} onPress={handleSearch} disabled={busy === 'search'} accessibilityLabel={t('client_tabs_layout.2')}>
            {busy === 'search' ? <ActivityIndicator color={COLORS.indigo} /> : <Search size={18} color={COLORS.indigo} />}
          </PressableScale>
        </View>
      </View>

      <View style={styles.sheet}>
        <Text style={styles.title}>{t('map.addressOnMap')}</Text>
        <Text style={styles.hint}>{t('map.pickerHint')}</Text>
        <Text style={styles.detected} numberOfLines={2}>
          {detected || '…'}
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.row}>
          <PressableScale style={styles.outlineButton} onPress={handleLocate} disabled={!!busy}>
            {busy === 'locate' ? (
              <ActivityIndicator color={COLORS.indigo} />
            ) : (
              <>
                <LocateFixed size={17} color={COLORS.ink} />
                <Text style={styles.outlineText}>{t('map.myLocation')}</Text>
              </>
            )}
          </PressableScale>
          <PressableScale style={styles.primaryButton} onPress={handleSave} disabled={!!busy}>
            {busy === 'save' ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryText}>{t('map.savePlace')}</Text>}
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white, padding: SPACING.xl },
  pinWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  top: { position: 'absolute', top: 56, left: SPACING.lg, right: SPACING.lg, flexDirection: 'row', gap: SPACING.sm },
  iconButton: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B1120', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.white, paddingLeft: SPACING.md, shadowColor: '#0B1120', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  searchInput: { flex: 1, fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.text },
  searchButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACING.xl, paddingBottom: 34, backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, gap: SPACING.sm },
  title: { fontFamily: FONT.extrabold, fontSize: 18, color: COLORS.ink },
  hint: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  detected: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.ink, marginTop: SPACING.xs },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger },
  row: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  outlineButton: { flex: 1, height: 50, flexDirection: 'row', gap: 6, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center' },
  outlineText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  primaryButton: { flex: 1.3, height: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.white },
});
