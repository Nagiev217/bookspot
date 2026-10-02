// Первый вход по временному паролю, который admin или владелец салона
// переслал в WhatsApp: пока пароль не сменён, гейт в index.jsx никуда
// дальше не пускает (profiles.must_change_password, 0022).
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import PressableScale from '@/components/PressableScale';
import { supabase } from '@/utils/supabase/config';
import { changeMyPassword } from '@/utils/supabase/profile';
import { useAuthStore } from '@/utils/auth/store';
import { friendlyError } from '@/utils/errors';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { t } from '@/utils/i18n';

export default function ChangePassword() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setError(null);
    if (password.length < 8) return setError(t('auth_change_password.1'));
    if (password !== repeat) return setError(t('auth_change_password.2'));
    setBusy(true);
    try {
      await changeMyPassword(password);
      setAuth({ mustChangePassword: false });
      router.replace('/');
    } catch (e) {
      setError(friendlyError(e, t('auth_change_password.3')));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('auth_change_password.4')}</Text>
      <Text style={styles.subtitle}>{t('auth_change_password.5')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('auth_change_password.6')}
        placeholderTextColor={COLORS.sub}
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder={t('auth_change_password.7')}
        placeholderTextColor={COLORS.sub}
        secureTextEntry
        autoCapitalize="none"
        value={repeat}
        onChangeText={setRepeat}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <PressableScale style={styles.button} onPress={handleSave} disabled={busy}>
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>{t('auth_change_password.8')}</Text>}
      </PressableScale>

      <PressableScale onPress={handleSignOut}>
        <Text style={styles.backLink}>{t('common.15')}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: SPACING.xl, backgroundColor: COLORS.white },
  title: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.xxl, color: COLORS.text, letterSpacing: -0.4 },
  subtitle: { fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.sub, marginTop: SPACING.xs, marginBottom: SPACING.xl, lineHeight: 20 },
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
  button: { backgroundColor: COLORS.indigo, borderRadius: RADIUS.sm, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.xs },
  buttonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
  backLink: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, textAlign: 'center', marginTop: SPACING.lg },
});
