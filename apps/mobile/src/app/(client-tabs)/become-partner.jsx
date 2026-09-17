// "Стать партнёром" — createBusiness создаёт бизнес сразу активным
// (модерации в Фазе 0 нет). После успеха роль становится business_owner
// и index.jsx на следующем заходе отправит в (business-tabs).
import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { router } from 'expo-router';
import { createBusiness } from '@/utils/supabase/profile';
import { listCategories } from '@/utils/supabase/catalog';
import { useAuthStore } from '@/utils/auth/store';
import { setCachedRole, setCachedMode } from '@/utils/auth/roleCache';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

export default function BecomePartner() {
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('Баку');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { uid, setAuth } = useAuthStore();

  useEffect(() => {
    listCategories()
      .then((cats) => {
        setCategories(cats);
        setCategoryId((prev) => prev ?? cats[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError('Введите название');
    if (!city.trim()) return setError('Введите город');
    if (!categoryId) return setError('Выберите категорию');

    setBusy(true);
    try {
      const { businessId } = await createBusiness({
        name: name.trim(),
        categoryId,
        city: city.trim(),
        district: district.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
      });

      await setCachedRole(uid, 'business_owner', businessId);
      await setCachedMode(uid, 'business');
      setAuth({ status: 'signedIn', uid, role: 'business_owner', businessId, mode: 'business' });
      router.replace('/');
    } catch (e) {
      setError(e.message || 'Не удалось создать бизнес');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Стать партнёром</Text>

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
      <TextInput style={styles.input} placeholder="Телефон" placeholderTextColor={COLORS.sub} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

      {error && <Text style={styles.error}>{error}</Text>}

      <PressableScale style={styles.button} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Создать бизнес</Text>}
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: SPACING.xl, backgroundColor: COLORS.white },
  title: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.xl, color: COLORS.text, marginBottom: SPACING.xl },
  label: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.sm },
  chipRow: { gap: SPACING.sm, paddingBottom: SPACING.md },
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
  button: { backgroundColor: COLORS.indigo, borderRadius: RADIUS.sm, padding: SPACING.md, alignItems: 'center' },
  buttonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
});
