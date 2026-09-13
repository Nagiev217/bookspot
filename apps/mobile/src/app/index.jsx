// Чистый гейт-компонент: ничего не рисует, только решает, куда перенаправить.
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/utils/auth/store';

export default function Index() {
  const { status, role, mode } = useAuthStore();

  if (status === 'loading') return null;
  if (status === 'signedOut') return <Redirect href="/(auth)/login" />;

  // Авторизован, но users/{uid} ещё не создан (например, приложение
  // закрыли между созданием аккаунта и вызовом registerProfile).
  if (role === null) return <Redirect href="/(auth)/register" />;

  const isStaff = role === 'business_owner' || role === 'staff';
  if (isStaff && mode === 'business') return <Redirect href="/(business-tabs)" />;
  return <Redirect href="/(client-tabs)" />;
}
