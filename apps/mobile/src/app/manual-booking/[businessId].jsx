// Ручная запись "по звонку" — бизнес заводит бронь на клиента без аккаунта.
// Та же услуга→мастер→дата→время последовательность, что в booking flow
// клиента, плюс форма имени/телефона в конце.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import { listServices, listMasters } from '@/utils/supabase/catalog';
import { createManualBooking } from '@/utils/supabase/business';
import { getAvailability } from '@/utils/supabase/booking';
import DateTimeGrid, { bakuToday } from '@/components/DateTimeGrid';

const STEPS = ['Услуга', 'Мастер', 'Время', 'Клиент'];

export default function ManualBooking() {
  const { businessId } = useLocalSearchParams();
  const [services, setServices] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([listServices(businessId), listMasters(businessId)])
        .then(([s, m]) => {
          if (cancelled) return;
          setServices(s);
          setMasters(m);
        })
        .catch((e) => !cancelled && setError(e.message || 'Не удалось загрузить'))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [businessId])
  );

  const [step, setStep] = useState(1);
  const [serviceIdx, setServiceIdx] = useState(0);
  const [masterIdx, setMasterIdx] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [time, setTime] = useState(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const service = services[serviceIdx];
  const master = masterIdx === null ? null : masters[masterIdx];

  function goToTimeStep() {
    setStep(3);
    setAvailLoading(true);
    getAvailability({ masterId: master.id, serviceId: service.id, from: bakuToday(), days: 14 })
      .then((map) => {
        setAvailability(map);
        const first = Object.keys(map).sort()[0];
        setSelectedDate(first || bakuToday());
      })
      .catch((e) => setError(e.message || 'Не удалось загрузить доступность'))
      .finally(() => setAvailLoading(false));
  }

  async function handleSubmit() {
    if (!clientName.trim()) {
      setSaveError('Укажите имя клиента');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await createManualBooking({
        businessId,
        masterId: master.id,
        serviceId: service.id,
        date: selectedDate,
        start: time,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
      });
      router.replace('/(business-tabs)');
    } catch (e) {
      if (e.code === '23P01') {
        setSaveError('Этот слот только что заняли — вернитесь и выберите другое время.');
      } else {
        setSaveError(e.message || 'Не удалось создать запись');
      }
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
  if (error || services.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Сначала добавьте услуги'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <Pressable style={styles.backButton} onPress={() => (step === 1 ? router.back() : setStep((s) => s - 1))}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Запись вручную</Text>
          <Text style={styles.sub}>
            Шаг {step} из 4 · {STEPS[step - 1]}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {saveError && <Text style={styles.errorInline}>{saveError}</Text>}

        {step === 1 && (
          <View style={{ gap: SPACING.sm }}>
            {services.map((v, i) => (
              <Pressable key={v.id} style={[styles.row, serviceIdx === i && styles.rowActive]} onPress={() => setServiceIdx(i)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName}>{v.name}</Text>
                  <Text style={styles.rowSub}>{v.duration_min} мин</Text>
                </View>
                <Text style={styles.rowPrice}>{v.price} ₼</Text>
              </Pressable>
            ))}
            <Pressable style={styles.nextButton} onPress={() => setStep(2)}>
              <Text style={styles.nextButtonText}>Далее</Text>
            </Pressable>
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: SPACING.sm }}>
            {masters.length === 0 ? (
              <Text style={styles.rowSub}>Нет мастеров.</Text>
            ) : (
              masters.map((m, i) => (
                <Pressable key={m.id} style={[styles.row, masterIdx === i && styles.rowActive]} onPress={() => setMasterIdx(i)}>
                  <View style={[styles.masterThumb, { backgroundColor: tintFor(m.id)[0] }]} />
                  <Text style={styles.rowName}>{m.name}</Text>
                </Pressable>
              ))
            )}
            <Pressable style={[styles.nextButton, masterIdx === null && styles.nextButtonOff]} disabled={masterIdx === null} onPress={goToTimeStep}>
              <Text style={styles.nextButtonText}>Далее</Text>
            </Pressable>
          </View>
        )}

        {step === 3 && (
          <View>
            <DateTimeGrid
              loading={availLoading}
              availability={availability}
              selectedDate={selectedDate}
              onSelectDate={(iso) => {
                setSelectedDate(iso);
                setTime(null);
              }}
              time={time}
              onSelectTime={setTime}
            />
            <Pressable style={[styles.nextButton, !time && styles.nextButtonOff]} disabled={!time} onPress={() => setStep(4)}>
              <Text style={styles.nextButtonText}>Далее</Text>
            </Pressable>
          </View>
        )}

        {step === 4 && (
          <View style={{ gap: SPACING.md }}>
            <TextInput
              style={styles.input}
              placeholder="Имя клиента"
              placeholderTextColor={COLORS.sub}
              value={clientName}
              onChangeText={setClientName}
            />
            <TextInput
              style={styles.input}
              placeholder="Телефон (необязательно)"
              placeholderTextColor={COLORS.sub}
              keyboardType="phone-pad"
              value={clientPhone}
              onChangeText={setClientPhone}
            />
            <Pressable style={styles.nextButton} disabled={saving} onPress={handleSubmit}>
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.nextButtonText}>Создать запись</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, padding: SPACING.xl, textAlign: 'center' },
  errorInline: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, marginBottom: SPACING.md },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: 52, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  backButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.ink, letterSpacing: -0.3 },
  sub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  body: { padding: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: 60 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  rowActive: { backgroundColor: COLORS.indigo100, borderColor: COLORS.indigo },
  rowName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  rowSub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  rowPrice: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  masterThumb: { width: 52, height: 52, borderRadius: 17 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    fontFamily: FONT.regular,
    fontSize: TEXT_SIZE.md,
    color: COLORS.ink,
  },
  nextButton: { height: 52, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.lg },
  nextButtonOff: { backgroundColor: '#E7E9F0' },
  nextButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.white },
});
