// Запрос разрешения на push и сохранение Expo push-токена. Разрешение
// спрашиваем НЕ при старте приложения (это отклоняет и раздражает
// пользователей, не увидевших ещё пользы), а в момент, когда польза
// очевидна — см. вызовы registerForPush() в booking/[idx].jsx (после
// успешной брони) и (business-tabs)/_layout.jsx (при входе владельца).
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { savePushToken } from '@/utils/supabase/profile';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Тихо ничего не делает при отказе/эмуляторе — push не блокер сценария,
// его отсутствие не должно ронять экран, на котором его вызвали.
export async function registerForPush() {
  try {
    if (!Device.isDevice) return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#2563EB',
      });
    }

    const projectId = 'dc12ae3c-45be-4b2f-be5b-a9ee9f74339f';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await savePushToken(token);
    return token;
  } catch {
    return null;
  }
}

// Тап по уведомлению — слушатель подписывается в src/app/_layout.jsx один
// раз на весь app lifecycle. Экрана "детали одной брони" в приложении нет
// (список — bookings.jsx у клиента, calendar.jsx у бизнеса), поэтому тап
// ведёт в соответствующий список, а не на несуществующий deep-link брони.
export function addNotificationResponseListener(onTap) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.type) onTap(data);
  });
}
