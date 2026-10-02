// Маршрут до салона и расстояния.
//
// openDirections — во внешний навигатор, своего маршрутизатора в приложении нет:
//   Android: geo:-ссылка, система сама предлагает все установленные карты
//            (Google Maps, Waze, Яндекс, …).
//   iOS:     меню из Apple Maps и тех навигаторов, что установлены. Схемы
//            перечислены в app.json → ios.infoPlist.LSApplicationQueriesSchemes,
//            без этого canOpenURL всегда отвечает false.
import { Platform, Linking, ActionSheetIOS } from 'react-native';
import { t } from '@/utils/i18n';

// Центр Баку — карта по умолчанию, пока салон не отмечен.
export const BAKU = { latitude: 40.4093, longitude: 49.8671 };

export function hasLocation(b) {
  return b && typeof b.lat === 'number' && typeof b.lng === 'number';
}

const webUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export async function openDirections({ lat, lng, name }) {
  const label = encodeURIComponent(name || '');
  if (Platform.OS === 'android') {
    const geo = `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
    return Linking.openURL(geo).catch(() => Linking.openURL(webUrl(lat, lng)));
  }

  const apps = [
    { title: 'Apple Maps', url: `maps://?daddr=${lat},${lng}&q=${label}`, always: true },
    { title: 'Google Maps', url: `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving` },
    { title: 'Waze', url: `waze://?ll=${lat},${lng}&navigate=yes` },
    { title: t('map.yandex'), url: `yandexmaps://maps.yandex.ru/?rtext=~${lat},${lng}&rtt=auto` },
  ];
  const available = [];
  for (const a of apps) {
    if (a.always || (await Linking.canOpenURL(a.url).catch(() => false))) available.push(a);
  }
  ActionSheetIOS.showActionSheetWithOptions(
    { title: t('map.routeTo', { name: name || '' }), options: [...available.map((a) => a.title), t('common.23')], cancelButtonIndex: available.length },
    (i) => {
      if (i < available.length) Linking.openURL(available[i].url).catch(() => Linking.openURL(webUrl(lat, lng)));
    }
  );
}

// Расстояние по прямой, км.
export function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(km) {
  if (km < 1) return t('map.meters', { n: Math.max(50, Math.round((km * 1000) / 50) * 50) });
  return t('map.km', { n: km < 10 ? km.toFixed(1) : Math.round(km) });
}
