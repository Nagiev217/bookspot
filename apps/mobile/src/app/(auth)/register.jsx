import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import { supabase } from '@/utils/supabase/config';
import { getMyProfile } from '@/utils/supabase/profile';
import { useAuthStore } from '@/utils/auth/store';
import { setCachedRole } from '@/utils/auth/roleCache';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

const LANGS = [
  { code: 'az', label: 'AZ' },
  { code: 'ru', label: 'RU' },
  { code: 'en', label: 'EN' },
];

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [lang, setLang] = useState('ru');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleRegister() {
    setError(null);
    setInfo(null);
    if (!name.trim()) return setError('Введите имя');
    if (!email.trim() || !password) return setError('Введите email и пароль');
    if (password.length < 6) return setError('Пароль должен быть не короче 6 символов');

    setBusy(true);
    try {
      // profiles.{id} создаётся триггером handle_new_user (0001_init.sql) —
      // name/lang передаются через user_metadata, отдельного вызова не нужно.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim(), lang } },
      });
      if (signUpError) throw signUpError;

      if (!data.session) {
        // Подтверждение email включено в настройках проекта — сессии ещё нет.
        setInfo('Проверьте почту и подтвердите email, затем войдите.');
        return;
      }

      const uid = data.user.id;
      const profile = await getMyProfile(uid);
      await setCachedRole(uid, profile.role, profile.businessId);
      setAuth({ status: 'signedIn', uid, role: profile.role, businessId: profile.businessId, mode: 'client' });
      router.replace('/');
    } catch (e) {
      setError(mapAuthError(e.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Регистрация</Text>

      <TextInput
        style={styles.input}
        placeholder="Имя"
        placeholderTextColor={COLORS.sub}
        value={name}
        onChangeText={setName}
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
        placeholder="Пароль (мин. 6 символов)"
        placeholderTextColor={COLORS.sub}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <View style={styles.langRow}>
        {LANGS.map((l) => (
          <Pressable
            key={l.code}
            style={[styles.langChip, lang === l.code && styles.langChipActive]}
            onPress={() => setLang(l.code)}
          >
            <Text style={[styles.langChipText, lang === l.code && styles.langChipTextActive]}>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {info && <Text style={styles.info}>{info}</Text>}

      <Pressable style={styles.button} onPress={handleRegister} disabled={busy}>
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Зарегистрироваться</Text>}
      </Pressable>

      <Link href="/(auth)/login" style={styles.link}>
        Уже есть аккаунт? Войти
      </Link>
    </ScrollView>
  );
}

function mapAuthError(message) {
  if (!message) return 'Не удалось зарегистрироваться. Попробуйте ещё раз';
  if (message.includes('already registered')) return 'Этот email уже зарегистрирован';
  if (message.includes('Password should be')) return 'Пароль слишком простой';
  if (message.includes('Unable to validate email')) return 'Некорректный email';
  if (message.includes('rate limit')) return 'Слишком много попыток — подождите пару минут и повторите';
  return 'Не удалось зарегистрироваться. Попробуйте ещё раз';
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
  langRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  langChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  langChipActive: { backgroundColor: COLORS.indigo50, borderColor: COLORS.indigo },
  langChipText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  langChipTextActive: { color: COLORS.indigo },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, marginBottom: SPACING.md },
  info: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.success, marginBottom: SPACING.md },
  button: { backgroundColor: COLORS.indigo, borderRadius: RADIUS.sm, padding: SPACING.md, alignItems: 'center' },
  buttonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
  link: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.indigo, textAlign: 'center', marginTop: SPACING.lg },
});
