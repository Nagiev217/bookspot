// "Стать партнёром" — createBusiness создаёт бизнес сразу активным
// (модерации в Фазе 0 нет). После успеха роль становится business_owner
// и index.jsx на следующем заходе отправит в (business-tabs).
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { createBusiness } from '@/utils/supabase/profile';
import { useAuthStore } from '@/utils/auth/store';
import { setCachedRole, setCachedMode } from '@/utils/auth/roleCache';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

export default function BecomePartner() {
  const [name, setName] = useState('');
  const [city, setCity] = useState('Баку');
  const [district, setDistrict] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { uid, setAuth } = useAuthStore();

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError('Введите название');
    if (!city.trim()) return setError('Введите город');

    setBusy(true);
    try {
      // categoryId пока фиксирован — выбор категории появится вместе с
      // экраном категорий в P0.4/P0.5.
      const { businessId } = await createBusiness({
        name: name.trim(),
        categoryId: 'beauty',
        city: city.trim(),
        district: district.trim() || null,
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

      <TextInput style={styles.input} placeholder="Название салона" placeholderTextColor={COLORS.sub} value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Город" placeholderTextColor={COLORS.sub} value={city} onChangeText={setCity} />
      <TextInput style={styles.input} placeholder="Район" placeholderTextColor={COLORS.sub} value={district} onChangeText={setDistrict} />
      <TextInput style={styles.input} placeholder="Телефон" placeholderTextColor={COLORS.sub} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>Создать бизнес</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: SPACING.xl, backgroundColor: COLORS.white },
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
  button: { backgroundColor: COLORS.blue, borderRadius: RADIUS.sm, padding: SPACING.md, alignItems: 'center' },
  buttonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
});
