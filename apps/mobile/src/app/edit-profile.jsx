// «Мои данные»: имя и телефон. Их видит салон в заявке — по телефону он
// звонит, если нужно что-то уточнить. В новые записи попадают новые данные;
// уже созданные записи хранят копию на момент записи (create_booking).
import { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { useAuthStore } from '@/utils/auth/store';
import { getMyContact, updateProfile } from '@/utils/supabase/profile';
import { normalizePhone, formatPhone } from '@/utils/phone';
import { t } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';

export default function EditProfile() {
  const uid = useAuthStore((s) => s.uid);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      let cancelled = false;
      getMyContact(uid)
        .then((p) => {
          if (cancelled) return;
          setName(p.name || '');
          setPhone(formatPhone(p.phone));
          setEmail(p.email || '');
        })
        .catch((e) => !cancelled && setError(friendlyError(e, t('common.20'))))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [uid])
  );

  async function handleSave() {
    setError(null);
    setInfo(null);
    if (!name.trim()) return setError(t('common.19'));
    const normalized = normalizePhone(phone);
    if (!normalized) return setError(t('profile.phoneInvalid'));
    setSaving(true);
    try {
      await updateProfile(uid, { name: name.trim(), phone: normalized });
      setPhone(formatPhone(normalized));
      setInfo(t('common.64'));
    } catch (e) {
      setError(friendlyError(e, t('common.65')));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale style={styles.backButton} onPress={() => router.back()} accessibilityLabel={t('common.40')}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
        <Text style={styles.title}>{t('profile.myData')}</Text>
      </View>

      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.label}>{t('common.12')}</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} textContentType="name" autoComplete="name" />

        <Text style={styles.label}>{t('business_settings_businessId.6')}</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('profile.phonePlaceholder')}
          placeholderTextColor={COLORS.sub}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
        />
        <Text style={styles.hint}>{t('profile.phoneHint')}</Text>

        <Text style={styles.label}>Email</Text>
        <Text style={styles.readonly}>{email}</Text>

        {error && <Text style={styles.error}>{error}</Text>}
        {info && <Text style={styles.info}>{info}</Text>}

        <PressableScale style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveText}>{t('common.68')}</Text>}
        </PressableScale>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  backButton: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, letterSpacing: -0.4 },
  content: { padding: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.sm },
  label: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: SPACING.sm },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACING.md, fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text },
  hint: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub },
  readonly: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.ink, paddingVertical: SPACING.sm },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger },
  info: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.success },
  saveButton: { height: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.lg },
  saveText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
});
