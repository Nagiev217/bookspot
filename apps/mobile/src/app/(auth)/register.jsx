import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { Link, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/utils/supabase/config';
import { buildSession } from '@/utils/supabase/profile';
import { useAuthStore } from '@/utils/auth/store';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/utils/legal';
import { t, getLang } from '@/utils/i18n';
import { normalizePhone } from '@/utils/phone';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

export default function Register() {
  const { redirect } = useLocalSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleRegister() {
    setError(null);
    setInfo(null);
    if (!name.trim()) return setError(t('common.19'));
    if (!email.trim() || !password) return setError(t('common.16'));
    // Телефон обязателен: по нему салон связывается с клиентом по заявке.
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return setError(t('profile.phoneInvalid'));
    if (password.length < 6) return setError(t('auth_register.1'));

    setBusy(true);
    try {
      // profiles.{id} создаётся триггером handle_new_user (0001_init.sql) —
      // name/lang передаются через user_metadata, отдельного вызова не нужно.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim(), phone: normalizedPhone, lang: getLang() } },
      });
      if (signUpError) throw signUpError;

      if (!data.session) {
        // Подтверждение email включено в настройках проекта — сессии ещё нет.
        setInfo(t('auth_register.2'));
        return;
      }

      setAuth(await buildSession(data.user.id));
      router.replace(typeof redirect === 'string' ? redirect : '/');
    } catch (e) {
      setError(mapAuthError(e.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{t('auth_register.3')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('common.12')}
        placeholderTextColor={COLORS.sub}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder={t('profile.phonePlaceholder')}
        placeholderTextColor={COLORS.sub}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        value={phone}
        onChangeText={setPhone}
      />
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
        placeholder={t('auth_register.4')}
        placeholderTextColor={COLORS.sub}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />


      {error && <Text style={styles.error}>{error}</Text>}
      {info && <Text style={styles.info}>{info}</Text>}

      <PressableScale style={styles.button} onPress={handleRegister} disabled={busy}>
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>{t('auth_register.5')}</Text>}
      </PressableScale>

      <Text style={styles.legalText}>{t('auth_register.6')}{' '}
        <Text style={styles.legalLink} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>{t('auth_register.7')}</Text>{' '}{t('auth_register.8')}{' '}
        <Text style={styles.legalLink} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}>{t('auth_register.9')}</Text>
      </Text>

      <Link
        href={{ pathname: '/(auth)/login', params: redirect ? { redirect } : undefined }}
        style={styles.link}
      >{t('auth_register.10')}</Link>

      <Link href="/(client-tabs)" style={styles.backLink}>{t('common.18')}</Link>
    </KeyboardAwareScrollView>
  );
}

function mapAuthError(message) {
  if (!message) return t('auth_register.11');
  if (message.includes('already registered')) return t('auth_register.12');
  if (message.includes('Password should be')) return t('auth_register.13');
  if (message.includes('Unable to validate email')) return t('auth_register.14');
  if (message.includes('rate limit')) return t('auth_register.15');
  return t('auth_register.11');
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xl, backgroundColor: COLORS.white },
  title: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.xl, color: COLORS.text, marginBottom: SPACING.xl },
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
  info: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.success, marginBottom: SPACING.md },
  button: { backgroundColor: COLORS.indigo, borderRadius: RADIUS.sm, padding: SPACING.md, alignItems: 'center' },
  buttonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
  link: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.indigo, textAlign: 'center', marginTop: SPACING.lg },
  backLink: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, textAlign: 'center', marginTop: SPACING.md },
  legalText: {
    fontFamily: FONT.regular,
    fontSize: TEXT_SIZE.xs,
    color: COLORS.sub,
    textAlign: 'center',
    marginTop: SPACING.md,
    lineHeight: 16,
  },
  legalLink: { color: COLORS.indigo, textDecorationLine: 'underline' },
});
