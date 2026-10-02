import { Tabs } from 'expo-router';
import { House, Search, Calendar, Heart, User } from 'lucide-react-native';
import { COLORS } from '@/theme/tokens';
import { t } from '@/utils/i18n';

export default function ClientTabsLayout() {
  return (
    // lazy: false — все вкладки монтируются и начинают грузить данные сразу
    // после входа, а не по первому заходу на каждую. Иначе первое
    // переключение на новую вкладку всегда показывает спиннер (см. тот же
    // приём loadedOnce в самих экранах — он защищает от повторного
    // мигания, но не от самого первого захода).
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: COLORS.indigo, tabBarInactiveTintColor: '#A3AAB8', lazy: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('client_tabs_layout.1'), tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t('client_tabs_layout.2'), tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: t('client_tabs_layout.3'), tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="favorites"
        options={{ title: t('common.43'), tabBarIcon: ({ color, size }) => <Heart color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('common.14'), tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
      <Tabs.Screen name="become-partner" options={{ href: null }} />
    </Tabs>
  );
}
