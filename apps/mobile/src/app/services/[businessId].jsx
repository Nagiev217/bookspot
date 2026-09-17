// Управление услугами салона — список + форма создания/редактирования в
// одном экране (не отдельный роут на форму: полей мало, лишний переход
// туда-обратно ничего не даёт).
import { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, Switch } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import {
  listAllServices,
  createService,
  updateService,
  deleteService,
  listAllMasters,
  listServiceMasterIds,
  setServiceMasters,
} from '@/utils/supabase/business';

const emptyForm = { id: null, name: '', price: '', durationMin: '', active: true, masterIds: [] };

export default function ServicesScreen() {
  const { businessId } = useLocalSearchParams();
  const [services, setServices] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null); // null = форма закрыта
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listAllServices(businessId), listAllMasters(businessId)])
      .then(([s, m]) => {
        setServices(s);
        setMasters(m);
      })
      .catch((e) => setError(e.message || 'Не удалось загрузить'))
      .finally(() => setLoading(false));
  }, [businessId]);

  useFocusEffect(load);

  async function openEdit(service) {
    setError(null);
    const masterIds = await listServiceMasterIds(service.id).catch(() => []);
    setForm({
      id: service.id,
      name: service.name,
      price: String(service.price),
      durationMin: String(service.duration_min),
      active: service.active,
      masterIds,
    });
  }

  function toggleFormMaster(masterId) {
    setForm((f) => ({
      ...f,
      masterIds: f.masterIds.includes(masterId) ? f.masterIds.filter((id) => id !== masterId) : [...f.masterIds, masterId],
    }));
  }

  async function handleSave() {
    setError(null);
    const name = form.name.trim();
    const price = Number(form.price);
    const durationMin = Number(form.durationMin);
    if (!name) return setError('Введите название услуги');
    if (!Number.isFinite(price) || price < 0) return setError('Некорректная цена');
    if (!Number.isInteger(durationMin) || durationMin <= 0) return setError('Длительность — целое число минут больше 0');

    setSaving(true);
    try {
      let serviceId = form.id;
      if (serviceId) {
        await updateService(serviceId, { name, price, duration_min: durationMin, active: form.active });
      } else {
        const created = await createService({ businessId, name, price, durationMin });
        serviceId = created.id;
      }
      await setServiceMasters(serviceId, form.masterIds);
      setForm(null);
      load();
    } catch (e) {
      setError(e.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(serviceId) {
    setSaving(true);
    try {
      await deleteService(serviceId);
      setForm(null);
      load();
    } catch (e) {
      setError(e.message || 'Не удалось удалить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
        <Text style={styles.title}>Услуги</Text>
        <PressableScale style={styles.addButton} onPress={() => setForm(emptyForm)}>
          <Plus size={18} color={COLORS.white} />
        </PressableScale>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={COLORS.indigo} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {error && !form && <Text style={styles.error}>{error}</Text>}

          {services.length === 0 ? (
            <Text style={styles.emptyText}>Пока нет ни одной услуги — добавьте первую.</Text>
          ) : (
            services.map((s) => (
              <PressableScale key={s.id} style={styles.row} onPress={() => openEdit(s)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowName, !s.active && styles.rowNameOff]}>{s.name}</Text>
                  <Text style={styles.rowMeta}>
                    {s.duration_min} мин{!s.active ? ' · выключена' : ''}
                  </Text>
                </View>
                <Text style={styles.rowPrice}>{s.price} ₼</Text>
              </PressableScale>
            ))
          )}

          {form && (
            <View style={styles.form}>
              <Text style={styles.formTitle}>{form.id ? 'Изменить услугу' : 'Новая услуга'}</Text>
              <TextInput style={styles.input} placeholder="Название" placeholderTextColor={COLORS.sub} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <View style={{ flexDirection: 'row', gap: SPACING.md }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Цена, ₼"
                  placeholderTextColor={COLORS.sub}
                  keyboardType="decimal-pad"
                  value={form.price}
                  onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Минут"
                  placeholderTextColor={COLORS.sub}
                  keyboardType="number-pad"
                  value={form.durationMin}
                  onChangeText={(v) => setForm((f) => ({ ...f, durationMin: v }))}
                />
              </View>

              {form.id && (
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Активна (видна клиентам)</Text>
                  <Switch value={form.active} onValueChange={(v) => setForm((f) => ({ ...f, active: v }))} trackColor={{ true: COLORS.indigo }} />
                </View>
              )}

              <Text style={styles.label}>Мастера, которые её оказывают</Text>
              {masters.length === 0 ? (
                <Text style={styles.emptyText}>Сначала добавьте мастеров во вкладке «Команда».</Text>
              ) : (
                <View style={{ gap: SPACING.sm }}>
                  {masters.map((m) => (
                    <PressableScale key={m.id} style={styles.masterRow} onPress={() => toggleFormMaster(m.id)}>
                      <View style={[styles.checkbox, form.masterIds.includes(m.id) && styles.checkboxOn]} />
                      <Text style={styles.masterName}>{m.name}</Text>
                    </PressableScale>
                  ))}
                </View>
              )}

              {error && <Text style={styles.error}>{error}</Text>}

              <View style={styles.formButtons}>
                {form.id && (
                  <PressableScale style={styles.deleteButton} onPress={() => handleDelete(form.id)} disabled={saving}>
                    <Trash2 size={16} color={COLORS.danger} />
                  </PressableScale>
                )}
                <PressableScale style={styles.cancelButton} onPress={() => setForm(null)} disabled={saving}>
                  <Text style={styles.cancelButtonText}>Отмена</Text>
                </PressableScale>
                <PressableScale style={styles.saveButton} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveButtonText}>Сохранить</Text>}
                </PressableScale>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  backButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, letterSpacing: -0.4 },
  addButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  list: { padding: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.sm },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.md },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, marginBottom: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md },
  rowName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  rowNameOff: { color: COLORS.sub },
  rowMeta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  rowPrice: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  form: { marginTop: SPACING.md, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, gap: SPACING.md },
  formTitle: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACING.md, fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.text },
  label: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  masterRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.border },
  checkboxOn: { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo },
  masterName: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.text },
  formButtons: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  deleteButton: { width: 44, height: 44, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { flex: 1, height: 44, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  saveButton: { flex: 1, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
});
