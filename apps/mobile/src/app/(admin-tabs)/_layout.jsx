// Режим платформенного администратора: салоны-партнёры и их подписки.
import { Tabs } from 'expo-router';
import { Store, Plus, User } from 'lucide-react-native';
import { COLORS } from '@/theme/tokens';
import { t } from '@/utils/i18n';

export default function AdminTabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: COLORS.indigo, tabBarInactiveTintColor: '#A3AAB8' }}>
      <Tabs.Screen name="index" options={{ title: t('common.13'), tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }} />
      <Tabs.Screen name="create" options={{ title: t('common.3'), tabBarIcon: ({ color, size }) => <Plus color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('common.14'), tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
    </Tabs>
  );
}
