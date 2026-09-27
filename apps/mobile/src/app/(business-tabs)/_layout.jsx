import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { House, Calendar, Users, User } from 'lucide-react-native';
import { COLORS } from '@/theme/tokens';
import { registerForPush } from '@/utils/notifications';

export default function BusinessTabsLayout() {
  // Владелец/сотрудник заходит в бизнес-режим — здесь push уже имеет явную
  // пользу (уведомление о новой брони), поэтому спрашиваем разрешение сразу
  // при входе, а не откладываем до первого события. Тихо no-op'ает при отказе.
  useEffect(() => {
    registerForPush();
  }, []);

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
