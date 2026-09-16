import { useEffect } from 'react';
import { Stack } from 'expo-router';
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
import { getMyProfile } from '@/utils/supabase/profile';
import { useAuthStore } from '@/utils/auth/store';
import { getCachedRole, setCachedRole, getCachedMode } from '@/utils/auth/roleCache';
import { useReducedMotion } from '@/utils/useReducedMotion';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
        setAuth({ status: 'signedOut', uid: null, role: null, businessId: null, mode: 'client' });
        return;
      }

      const cached = await getCachedRole(user.id);
      if (mySession !== sessionRef) return;
      if (cached) {
        const mode = await getCachedMode(
          user.id,
          cached.role === 'business_owner' || cached.role === 'staff' ? 'business' : 'client'
        );
        if (mySession !== sessionRef) return;
        setAuth({ status: 'signedIn', uid: user.id, role: cached.role, businessId: cached.businessId, mode });
      }

      try {
        const profile = await getMyProfile(user.id);
        if (mySession !== sessionRef) return;
        const mode = await getCachedMode(
          user.id,
          profile.role === 'business_owner' || profile.role === 'staff' ? 'business' : 'client'
        );
        if (mySession !== sessionRef) return;
        setAuth({ status: 'signedIn', uid: user.id, role: profile.role, businessId: profile.businessId, mode });
        await setCachedRole(user.id, profile.role, profile.businessId);
      } catch {
        // Сеть недоступна и кэша нет — role остаётся null, гейт в index.jsx
        // отправит на регистрацию профиля.
        if (!cached && mySession === sessionRef) {
          setAuth({ status: 'signedIn', uid: user.id, role: null, businessId: null, mode: 'client' });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [setAuth]);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      {/* fade — переключение Client/Business mode (switchMode делает
          router.replace между этими двумя группами) раньше менялось
          мгновенным резким скачком экрана; с fade это читается как
          осознанный переход, а не зависание/лаг. */}
      <Stack.Screen name="(client-tabs)" options={{ animation: reducedMotion ? 'none' : 'fade' }} />
      <Stack.Screen name="(business-tabs)" options={{ animation: reducedMotion ? 'none' : 'fade' }} />
      {/* Просмотр/дрилл-даун — обычный push. */}
      <Stack.Screen name="salon/[idx]" options={{ gestureEnabled: true }} />
      <Stack.Screen name="booking/[idx]" options={{ gestureEnabled: true }} />
      {/* Формы — модально, снизу вверх: по apple-design (п.7, "Spatial
          consistency") форма поверх текущего экрана должна выглядеть и
          закрываться как форма, а не как ещё один уровень навигации push. */}
      <Stack.Screen name="reschedule/[bookingId]" options={{ presentation: 'modal', gestureEnabled: true }} />
      <Stack.Screen name="manual-booking/[businessId]" options={{ presentation: 'modal', gestureEnabled: true }} />
      <Stack.Screen name="services/[businessId]" options={{ presentation: 'modal', gestureEnabled: true }} />
      <Stack.Screen name="business-settings/[businessId]" options={{ presentation: 'modal', gestureEnabled: true }} />
      <Stack.Screen name="master/[masterId]" options={{ presentation: 'modal', gestureEnabled: true }} />
    </Stack>
  );
}
