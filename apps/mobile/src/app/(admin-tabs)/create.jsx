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

const PERIODS = [1, 3, 6, 12];

export default function AdminCreateBusiness() {
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('Баку');
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
    if (!categoryId) return setError('Выберите категорию');
    if (name.trim().length < 2) return setError('Введите название салона');
    if (!city.trim()) return setError('Введите город');
    if (!ownerName.trim()) return setError('Введите имя владельца');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())) return setError('Введите email владельца');

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
      setError(e.message || 'Не удалось создать салон');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.title}>Салон создан</Text>
        <Text style={styles.subtitle}>
          «{result.businessName}» — подписка до {formatDateRu(paidUntil)}. Отправьте владельцу данные для входа.
        </Text>
        <CredentialsCard
          title="Аккаунт владельца"
          name={result.ownerName}
          email={result.email}
          password={result.password}
          phone={result.ownerPhone}
          businessName={result.businessName}
        />
        <PressableScale style={styles.secondary} onPress={() => router.push(`/admin-business/${result.businessId}`)}>
          <Text style={styles.secondaryText}>Открыть карточку салона</Text>
        </PressableScale>
        <PressableScale style={styles.secondary} onPress={reset}>
          <Text style={styles.secondaryText}>Создать ещё один</Text>
        </PressableScale>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Новый салон</Text>

      <Text style={styles.section}>Салон</Text>
      <Text style={styles.label}>Категория</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {categories.map((c) => (
          <PressableScale key={c.id} style={[styles.chip, categoryId === c.id && styles.chipActive]} onPress={() => setCategoryId(c.id)}>
            <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>{c.name_ru}</Text>
          </PressableScale>
        ))}
      </ScrollView>
      <TextInput style={styles.input} placeholder="Название салона" placeholderTextColor={COLORS.sub} value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Город" placeholderTextColor={COLORS.sub} value={city} onChangeText={setCity} />
      <TextInput style={styles.input} placeholder="Район" placeholderTextColor={COLORS.sub} value={district} onChangeText={setDistrict} />
      <TextInput style={styles.input} placeholder="Адрес" placeholderTextColor={COLORS.sub} value={address} onChangeText={setAddress} />
      <TextInput style={styles.input} placeholder="Телефон салона" placeholderTextColor={COLORS.sub} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

      <Text style={styles.section}>Подписка</Text>
      <View style={styles.chipRowWrap}>
        {PERIODS.map((m) => (
          <PressableScale key={m} style={[styles.chip, months === m && styles.chipActive]} onPress={() => setMonths(m)}>
            <Text style={[styles.chipText, months === m && styles.chipTextActive]}>{m} мес.</Text>
          </PressableScale>
        ))}
      </View>
      <Text style={styles.hint}>Оплачено до {formatDateRu(paidUntil)}</Text>

      <Text style={styles.section}>Владелец</Text>
      <TextInput style={styles.input} placeholder="Имя" placeholderTextColor={COLORS.sub} value={ownerName} onChangeText={setOwnerName} />
      <TextInput
        style={styles.input}
        placeholder="Email — будет логином"
        placeholderTextColor={COLORS.sub}
        autoCapitalize="none"
        keyboardType="email-address"
        value={ownerEmail}
        onChangeText={setOwnerEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="WhatsApp владельца (+994…)"
        placeholderTextColor={COLORS.sub}
        keyboardType="phone-pad"
        value={ownerPhone}
        onChangeText={setOwnerPhone}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <PressableScale style={styles.button} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Создать салон и аккаунт</Text>}
      </PressableScale>
    </ScrollView>
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
