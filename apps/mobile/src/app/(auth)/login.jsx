import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { supabase, IS_SUPABASE_READY } from '@/utils/supabase/config';
import { buildSession } from '@/utils/supabase/profile';
import { useAuthStore } from '@/utils/auth/store';
import { friendlyError } from '@/utils/errors';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

export default function Login() {
  // Ставится экранами, требующими аккаунта (бронь, избранное), когда гость
  // туда попадает без входа — см. booking/[idx].jsx и сердечко в salon/[idx].jsx.
  const { redirect } = useLocalSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Введите email и пароль');
      return;
    }
    setBusy(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      // index.jsx — единственное место, где стор реально читается для
      // редиректа, и оно перечитывает его только при своём монтировании.
      // _layout.jsx тоже подписан на onAuthStateChange и обновит тот же
      // стор, но асинхронно — полагаться на то, что он успеет раньше
      // редиректа, нельзя: если status ещё 'signedOut' в момент replace,
      // index.jsx отправит обратно на этот же экран, и без другого
      // подписчика уже ничто не перепроверит стор повторно. Поэтому статус
      // выставляется здесь же, синхронно с самим redirect.
      const session = await buildSession(data.user.id);
      setAuth(session);
      // Временный пароль — сначала через гейт на смену пароля, даже если
      // вход был вызван со страницы брони/избранного.
      router.replace(typeof redirect === 'string' && !session.mustChangePassword ? redirect : '/');
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>BookSpot</Text>
      <Text style={styles.subtitle}>Войти в аккаунт</Text>

      {!IS_SUPABASE_READY && (
        <Text style={styles.warning}>
          Supabase не настроен — заполните apps/mobile/.env
        </Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={COLORS.sub}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Пароль"
        placeholderTextColor={COLORS.sub}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <PressableScale style={styles.button} onPress={handleLogin} disabled={busy}>
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Войти</Text>}
      </PressableScale>

      <Link
        href={{ pathname: '/(auth)/register', params: redirect ? { redirect } : undefined }}
        style={styles.link}
      >
        Нет аккаунта? Зарегистрироваться
      </Link>

      <Link href="/(client-tabs)" style={styles.backLink}>
        Назад к каталогу
      </Link>
    </View>
  );
}

function mapAuthError(e) {
  const message = e?.message || '';
  // Сеть/офлайн важно отличать от неверного пароля первым делом — иначе
  // пользователь при обрыве связи решит, что забыл пароль, и начнёт его
  // сбрасывать вместо того, чтобы просто проверить интернет.
  if (!message) return 'Не удалось войти. Попробуйте ещё раз';
  if (message.includes('Invalid login credentials')) return 'Неверный email или пароль';
  if (message.includes('Email not confirmed')) return 'Подтвердите email — проверьте почту';
  return friendlyError(e, 'Не удалось войти. Попробуйте ещё раз');
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: SPACING.xl, backgroundColor: COLORS.white },
  title: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.xxl, color: COLORS.text, letterSpacing: -0.4 },
  subtitle: { fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.sub, marginTop: SPACING.xs, marginBottom: SPACING.xl },
  warning: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.warning, marginBottom: SPACING.md },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    fontFamily: FONT.regular,
    fontSize: TEXT_SIZE.md,
    color: COLORS.text,
  },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, marginBottom: SPACING.md },
  button: {
    backgroundColor: COLORS.indigo,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  buttonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
  link: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.indigo, textAlign: 'center', marginTop: SPACING.lg },
  backLink: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, textAlign: 'center', marginTop: SPACING.md },
});
