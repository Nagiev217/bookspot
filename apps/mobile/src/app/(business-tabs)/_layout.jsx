import { Tabs } from 'expo-router';
import { LayoutDashboard, User } from 'lucide-react-native';
import { COLORS } from '@/theme/tokens';

export default function BusinessTabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: COLORS.indigo }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Дашборд', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Профиль', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tabs>
  );
}
