// Режим платформенного администратора: салоны-партнёры и их подписки.
import { Tabs } from 'expo-router';
import { Store, Plus, User } from 'lucide-react-native';
import { COLORS } from '@/theme/tokens';

export default function AdminTabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: COLORS.indigo, tabBarInactiveTintColor: '#A3AAB8' }}>
      <Tabs.Screen name="index" options={{ title: 'Салоны', tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }} />
      <Tabs.Screen name="create" options={{ title: 'Новый салон', tabBarIcon: ({ color, size }) => <Plus color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}
