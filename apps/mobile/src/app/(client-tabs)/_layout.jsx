import { Tabs } from 'expo-router';
import { House, Search, Calendar, Heart, User } from 'lucide-react-native';
import { COLORS } from '@/theme/tokens';

export default function ClientTabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: COLORS.indigo, tabBarInactiveTintColor: '#A3AAB8' }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Главная', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Поиск', tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'Брони', tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="favorites"
        options={{ title: 'Избранное', tabBarIcon: ({ color, size }) => <Heart color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Профиль', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
      <Tabs.Screen name="become-partner" options={{ href: null }} />
    </Tabs>
  );
}
