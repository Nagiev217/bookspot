import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { supabase, IS_SUPABASE_READY } from '@/utils/supabase/config';
import { buildSession } from '@/utils/supabase/profile';
import { useAuthStore } from '@/utils/auth/store';
import { getCachedRole, resolveMode } from '@/utils/auth/roleCache';
import { useReducedMotion } from '@/utils/useReducedMotion';
import { addNotificationResponseListener } from '@/utils/notifications';
import OfflineBanner from '@/components/OfflineBanner';
import PressableScale from '@/components/PressableScale';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Экспорт с именем ErrorBoundary — встроенный механизм expo-router: если
// рендер любого экрана под этим layout бросит исключение, вместо краша
// всего приложения (или сырого текста ошибки) покажется этот экран с
// кнопкой "Попробовать снова" (retry перемонтирует упавшее поддерево).
export function ErrorBoundary({ error, retry }) {
  return (
    <View style={styles.errorScreen}>
      <Text style={styles.errorTitle}>Что-то пошло не так</Text>
      <Text style={styles.errorMessage}>{error?.message || 'Приложение столкнулось с неожиданной ошибкой.'}</Text>
      <PressableScale style={styles.retryButton} onPress={retry}>
        <Text style={styles.retryText}>Попробовать снова</Text>
      </PressableScale>
    </View>
  );
}

export default function RootLayout() {
  const reducedMotion = useReducedMotion();
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (!IS_SUPABASE_READY) {
      // Supabase не настроен (.env пуст) — не блокируем экран навсегда,
      // показываем как "не авторизован", чтобы разработчик видел UI.
      setAuth({ status: 'signedOut', uid: null, role: null, businessId: null });
      return;
    }

    // sessionRef защищает от гонки: быстрый signOut→signIn не должен
    // применить роль устаревшего аккаунта поверх нового (см. dersreport77).
    let sessionRef = 0;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const mySession = ++sessionRef;
      const user = session?.user ?? null;

      if (!user) {
        setAuth({ status: 'signedOut', uid: null, role: null, businessId: null, masterId: null, mustChangePassword: false, mode: 'client' });
        return;
      }

      const cached = await getCachedRole(user.id);
      if (mySession !== sessionRef) return;
      if (cached) {
        const mode = await resolveMode(user.id, cached.role);
        if (mySession !== sessionRef) return;
        setAuth({ status: 'signedIn', uid: user.id, role: cached.role, businessId: cached.businessId, masterId: cached.masterId ?? null, mode });
      }

      try {
        const session = await buildSession(user.id);
        if (mySession !== sessionRef) return;
        setAuth(session);
      } catch {
        // Сеть недоступна и кэша нет — role остаётся null, гейт в index.jsx
        // отправит на регистрацию профиля.
        if (!cached && mySession === sessionRef) {
          setAuth({ status: 'signedIn', uid: user.id, role: null, businessId: null, masterId: null, mode: 'client' });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [setAuth]);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  useEffect(() => {
    // Отдельного экрана "одна бронь" нет — тап по уведомлению ведёт в
    // соответствующий список: бизнес-типы в календарь владельца, остальные
    // (подтверждение/напоминание/отмена) — в список броней клиента.
    const sub = addNotificationResponseListener((data) => {
      if (data.type === 'new_booking_business') {
        router.push('/(business-tabs)/calendar');
      } else {
        router.push('/(client-tabs)/bookings');
      }
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        {/* fade — переключение Client/Business mode (switchMode делает
            router.replace между этими двумя группами) раньше менялось
            мгновенным резким скачком экрана; с fade это читается как
            осознанный переход, а не зависание/лаг. */}
        <Stack.Screen name="(client-tabs)" options={{ animation: reducedMotion ? 'none' : 'fade' }} />
        <Stack.Screen name="(business-tabs)" options={{ animation: reducedMotion ? 'none' : 'fade' }} />
        <Stack.Screen name="(admin-tabs)" options={{ animation: reducedMotion ? 'none' : 'fade' }} />
        {/* Просмотр/дрилл-даун — обычный push. */}
        <Stack.Screen name="salon/[idx]" options={{ gestureEnabled: true }} />
        <Stack.Screen name="booking/[idx]" options={{ gestureEnabled: true }} />
        {/* Формы — модально, снизу вверх: по apple-design (п.7, "Spatial
            consistency") форма поверх текущего экрана должна выглядеть и
            закрываться как форма, а не как ещё один уровень навигации push. */}
        <Stack.Screen name="reschedule/[bookingId]" options={{ presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen name="review/[bookingId]" options={{ presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen name="admin-business/[id]" options={{ gestureEnabled: true }} />
        <Stack.Screen name="manual-booking/[businessId]" options={{ presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen name="services/[businessId]" options={{ presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen name="business-settings/[businessId]" options={{ presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen name="business-photos/[businessId]" options={{ gestureEnabled: true }} />
        <Stack.Screen name="salon-setup/[businessId]" options={{ gestureEnabled: true }} />
        <Stack.Screen name="my-master-profile" options={{ gestureEnabled: true }} />
        <Stack.Screen name="master-info/[masterId]" options={{ gestureEnabled: true }} />
        <Stack.Screen name="master/[masterId]" options={{ presentation: 'modal', gestureEnabled: true }} />
      </Stack>
      <OfflineBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  errorScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, backgroundColor: COLORS.white },
  errorTitle: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.xl, color: COLORS.ink, marginBottom: SPACING.sm, textAlign: 'center' },
  errorMessage: { fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.sub, textAlign: 'center', marginBottom: SPACING.xl },
  retryButton: { backgroundColor: COLORS.indigo, borderRadius: RADIUS.sm, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl },
  retryText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
});
