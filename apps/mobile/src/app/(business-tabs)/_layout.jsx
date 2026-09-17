import { Tabs } from 'expo-router';
import { House, Calendar, Users, User } from 'lucide-react-native';
import { COLORS } from '@/theme/tokens';

export default function BusinessTabsLayout() {
  return (
    // lazy: false — см. тот же комментарий в (client-tabs)/_layout.jsx.
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: COLORS.indigo, tabBarInactiveTintColor: '#A3AAB8', lazy: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Сегодня', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Календарь', tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="team"
        options={{ title: 'Команда', tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Профиль', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tabs>
  );
}
