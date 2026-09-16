// Настройки бизнеса — единственное место, где владелец правит поля,
// заданные один раз при createBusiness, плюс числовые параметры
// бронирования (slot_step_min/buffer_min/cancel_window_hours), которые до
// сих пор были колонками без единого экрана.
import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { getMyBusiness, updateBusiness } from '@/utils/supabase/business';
import { listCategories } from '@/utils/supabase/catalog';

export default function BusinessSettingsScreen() {
  const { businessId } = useLocalSearchParams();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([getMyBusiness(businessId), listCategories()])
        .then(([b, cats]) => {
          if (cancelled) return;
          setCategories(cats);
          setForm({
            name: b.name,
            categoryId: b.category_id,
            city: b.city,
            district: b.district || '',
            address: b.address || '',
            phone: b.phone || '',
            description: b.description || '',
            slotStepMin: String(b.slot_step_min),
            bufferMin: String(b.buffer_min),
            cancelWindowHours: String(b.cancel_window_hours),
          });
        })
        .catch((e) => !cancelled && setError(e.message || 'Не удалось загрузить'))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [businessId])
  );

  async function handleSave() {
    setError(null);
    setInfo(null);
    const name = form.name.trim();
    const city = form.city.trim();
    const slotStepMin = Number(form.slotStepMin);
    const bufferMin = Number(form.bufferMin);
    const cancelWindowHours = Number(form.cancelWindowHours);
    if (!name) return setError('Введите название');
    if (!city) return setError('Введите город');
    if (!Number.isInteger(slotStepMin) || slotStepMin <= 0) return setError('Шаг слота — целое число минут больше 0');
    if (!Number.isInteger(bufferMin) || bufferMin < 0) return setError('Буфер — целое число минут, 0 или больше');
    if (!Number.isInteger(cancelWindowHours) || cancelWindowHours < 0) return setError('Окно отмены — целое число часов, 0 или больше');

    setSaving(true);
    try {
      await updateBusiness(businessId, {
        name,
        category_id: form.categoryId,
        city,
        district: form.district.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        description: form.description.trim(),
        slot_step_min: slotStepMin,
        buffer_min: bufferMin,
        cancel_window_hours: cancelWindowHours,
      });
      setInfo('Сохранено');
    } catch (e) {
      setError(e.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </Pressable>
        <Text style={styles.title}>Настройки бизнеса</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <TextInput style={styles.input} placeholder="Название" placeholderTextColor={COLORS.sub} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />

        <Text style={styles.label}>Категория</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.chip, form.categoryId === c.id && styles.chipActive]}
              onPress={() => setForm((f) => ({ ...f, categoryId: c.id }))}
            >
              <Text style={[styles.chipText, form.categoryId === c.id && styles.chipTextActive]}>{c.name_ru}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <TextInput style={styles.input} placeholder="Город" placeholderTextColor={COLORS.sub} value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} />
        <TextInput style={styles.input} placeholder="Район" placeholderTextColor={COLORS.sub} value={form.district} onChangeText={(v) => setForm((f) => ({ ...f, district: v }))} />
        <TextInput style={styles.input} placeholder="Адрес" placeholderTextColor={COLORS.sub} value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} />
        <TextInput
          style={styles.input}
          placeholder="Телефон"
          placeholderTextColor={COLORS.sub}
          keyboardType="phone-pad"
          value={form.phone}
          onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
        />
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Описание"
          placeholderTextColor={COLORS.sub}
          multiline
          value={form.description}
          onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
        />

        <Text style={styles.sectionTitle}>Параметры бронирования</Text>
        <View style={styles.row3}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Шаг слота, мин</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={form.slotStepMin} onChangeText={(v) => setForm((f) => ({ ...f, slotStepMin: v }))} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Буфер, мин</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={form.bufferMin} onChangeText={(v) => setForm((f) => ({ ...f, bufferMin: v }))} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Окно отмены, ч</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={form.cancelWindowHours} onChangeText={(v) => setForm((f) => ({ ...f, cancelWindowHours: v }))} />
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        {info && <Text style={styles.info}>{info}</Text>}

        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveButtonText}>Сохранить</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  backButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, letterSpacing: -0.4 },
  content: { padding: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.md },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACING.md, fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  label: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.sm },
  chipRow: { gap: SPACING.sm, paddingBottom: SPACING.sm },
  chip: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.indigo50, borderColor: COLORS.indigo },
  chipText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  chipTextActive: { color: COLORS.indigo },
  sectionTitle: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink, marginTop: SPACING.md },
  row3: { flexDirection: 'row', gap: SPACING.sm },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger },
  info: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.success },
  saveButton: { height: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm },
  saveButtonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
});
