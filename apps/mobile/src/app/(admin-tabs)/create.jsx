// Новый салон-партнёр + аккаунт его владельца. После создания — логин и
// временный пароль, которые отправляются владельцу в WhatsApp.
import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import PressableScale from '@/components/PressableScale';
import CredentialsCard from '@/components/CredentialsCard';
import { listCategories } from '@/utils/supabase/catalog';
import { createBusinessWithOwner, bakuTodayISO, addMonthsISO, formatDateRu } from '@/utils/supabase/admin';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { t, categoryName } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

const PERIODS = [1, 3, 6, 12];

export default function AdminCreateBusiness() {
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState(t('common.1'));
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [months, setMonths] = useState(1);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    listCategories()
      .then((cats) => {
        setCategories(cats);
        setCategoryId((prev) => prev ?? cats[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  const paidUntil = addMonthsISO(bakuTodayISO(), months);

  function reset() {
    setName(''); setDistrict(''); setAddress(''); setPhone('');
    setOwnerName(''); setOwnerEmail(''); setOwnerPhone('');
    setMonths(1); setResult(null); setError(null);
  }

  async function handleSubmit() {
    setError(null);
    if (!categoryId) return setError(t('admin_tabs_create.1'));
    if (name.trim().length < 2) return setError(t('admin_tabs_create.2'));
    if (!city.trim()) return setError(t('common.2'));
    if (!ownerName.trim()) return setError(t('admin_tabs_create.3'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())) return setError(t('admin_tabs_create.4'));

    setBusy(true);
    try {
      const res = await createBusinessWithOwner({
        business: {
          name: name.trim(),
          categoryId,
          city: city.trim(),
          district: district.trim() || null,
          address: address.trim() || null,
          phone: phone.trim() || null,
          paidUntil,
        },
        owner: { name: ownerName.trim(), email: ownerEmail.trim(), phone: ownerPhone.trim() || null },
      });
      setResult({ ...res, businessName: name.trim(), ownerName: ownerName.trim(), ownerPhone: ownerPhone.trim() || phone.trim() || null });
    } catch (e) {
      setError(friendlyError(e, t('admin_tabs_create.5')));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.screen}>
        <Text style={styles.title}>{t('admin_tabs_create.6')}</Text>
        <Text style={styles.subtitle}>
          «{result.businessName}{t('admin_tabs_create.7')}{' '}{formatDateRu(paidUntil)}{t('admin_tabs_create.8')}</Text>
        <CredentialsCard
          title={t('admin_tabs_create.9')}
          name={result.ownerName}
          email={result.email}
          password={result.password}
          phone={result.ownerPhone}
          businessName={result.businessName}
        />
        <PressableScale style={styles.secondary} onPress={() => router.push(`/admin-business/${result.businessId}`)}>
          <Text style={styles.secondaryText}>{t('admin_tabs_create.10')}</Text>
        </PressableScale>
        <PressableScale style={styles.secondary} onPress={reset}>
          <Text style={styles.secondaryText}>{t('admin_tabs_create.11')}</Text>
        </PressableScale>
      </KeyboardAwareScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{t('common.3')}</Text>

      <Text style={styles.section}>{t('common.4')}</Text>
      <Text style={styles.label}>{t('common.5')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {categories.map((c) => (
          <PressableScale key={c.id} style={[styles.chip, categoryId === c.id && styles.chipActive]} onPress={() => setCategoryId(c.id)}>
            <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>{categoryName(c)}</Text>
          </PressableScale>
        ))}
      </ScrollView>
      <TextInput style={styles.input} placeholder={t('admin_tabs_create.12')} placeholderTextColor={COLORS.sub} value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder={t('common.6')} placeholderTextColor={COLORS.sub} value={city} onChangeText={setCity} />
      <TextInput style={styles.input} placeholder={t('common.7')} placeholderTextColor={COLORS.sub} value={district} onChangeText={setDistrict} />
      <TextInput style={styles.input} placeholder={t('common.8')} placeholderTextColor={COLORS.sub} value={address} onChangeText={setAddress} />
      <TextInput style={styles.input} placeholder={t('admin_tabs_create.13')} placeholderTextColor={COLORS.sub} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

      <Text style={styles.section}>{t('common.9')}</Text>
      <View style={styles.chipRowWrap}>
        {PERIODS.map((m) => (
          <PressableScale key={m} style={[styles.chip, months === m && styles.chipActive]} onPress={() => setMonths(m)}>
            <Text style={[styles.chipText, months === m && styles.chipTextActive]}>{m}{' '}{t('common.10')}</Text>
          </PressableScale>
        ))}
      </View>
      <Text style={styles.hint}>{t('admin_tabs_create.14')}{' '}{formatDateRu(paidUntil)}</Text>

      <Text style={styles.section}>{t('common.11')}</Text>
      <TextInput style={styles.input} placeholder={t('common.12')} placeholderTextColor={COLORS.sub} value={ownerName} onChangeText={setOwnerName} />
      <TextInput
        style={styles.input}
        placeholder={t('admin_tabs_create.15')}
        placeholderTextColor={COLORS.sub}
        autoCapitalize="none"
        keyboardType="email-address"
        value={ownerEmail}
        onChangeText={setOwnerEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t('admin_tabs_create.16')}
        placeholderTextColor={COLORS.sub}
        keyboardType="phone-pad"
        value={ownerPhone}
        onChangeText={setOwnerPhone}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <PressableScale style={styles.button} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>{t('admin_tabs_create.17')}</Text>}
      </PressableScale>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: SPACING.xl, paddingTop: 56, paddingBottom: 40, backgroundColor: COLORS.white, gap: 0 },
  title: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xxl, color: COLORS.ink, letterSpacing: -0.6, marginBottom: SPACING.lg },
  subtitle: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub, marginBottom: SPACING.lg, lineHeight: 20 },
  section: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.lg, color: COLORS.ink, marginTop: SPACING.md, marginBottom: SPACING.md },
  label: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.sm },
  hint: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.md },
  chipRow: { gap: SPACING.sm, paddingBottom: SPACING.md },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm },
  chip: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.indigo50, borderColor: COLORS.indigo },
  chipText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  chipTextActive: { color: COLORS.indigo },
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
  button: { backgroundColor: COLORS.indigo, borderRadius: RADIUS.sm, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.sm },
  buttonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
  secondary: { height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md },
  secondaryText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
});
