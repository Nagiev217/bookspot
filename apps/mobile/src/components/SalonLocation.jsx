// Адрес салона в карточке: строка адреса, мини-карта с меткой и кнопка
// «Маршрут» (внешний навигатор, utils/maps). Карта неинтерактивная — её
// задача показать, где это, а не заменить навигатор; тап по ней тоже ведёт
// в маршрут. Без отметки на карте (старые салоны) — только адрес.
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { MapPin, Navigation } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { hasLocation, openDirections } from '@/utils/maps';
import { t } from '@/utils/i18n';

export default function SalonLocation({ business }) {
  const line = [business.district, business.address].filter(Boolean).join(', ');
  const fullAddress = [business.city, line].filter(Boolean).join(', ');
  const located = hasLocation(business);
  const route = () => openDirections({ lat: business.lat, lng: business.lng, name: business.name });

  if (!fullAddress && !located) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.addressRow}>
        <MapPin size={18} color={COLORS.indigo} />
        <Text style={styles.address}>{fullAddress}</Text>
      </View>

      {located && (
        <>
          <PressableScale style={styles.mapBox} onPress={route} accessibilityLabel={t('map.route')}>
            <MapView
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              liteMode
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
              initialRegion={{ latitude: business.lat, longitude: business.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
            >
              <Marker coordinate={{ latitude: business.lat, longitude: business.lng }} pinColor={COLORS.indigo} />
            </MapView>
          </PressableScale>
          <PressableScale style={styles.routeButton} onPress={route}>
            <Navigation size={17} color={COLORS.white} />
            <Text style={styles.routeText}>{t('map.route')}</Text>
          </PressableScale>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.md, marginTop: SPACING.md },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  address: { flex: 1, fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.ink, lineHeight: 20 },
  mapBox: { height: 160, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.surface },
  routeButton: { height: 48, flexDirection: 'row', gap: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  routeText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.white },
});
