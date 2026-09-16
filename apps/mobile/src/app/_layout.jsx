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

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
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
      <Stack.Screen name="(client-tabs)" />
      <Stack.Screen name="(business-tabs)" />
      <Stack.Screen name="salon/[idx]" options={{ gestureEnabled: true }} />
      <Stack.Screen name="booking/[idx]" options={{ gestureEnabled: true }} />
      <Stack.Screen name="reschedule/[bookingId]" options={{ gestureEnabled: true }} />
      <Stack.Screen name="manual-booking/[businessId]" options={{ gestureEnabled: true }} />
      <Stack.Screen name="services/[businessId]" options={{ gestureEnabled: true }} />
      <Stack.Screen name="business-settings/[businessId]" options={{ gestureEnabled: true }} />
      <Stack.Screen name="master/[masterId]" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
