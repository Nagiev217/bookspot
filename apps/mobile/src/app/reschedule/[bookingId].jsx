// Перенос брони — те же дата/время что в booking flow, но через
// reschedule_booking (сохраняет исходную длительность услуги, EXCLUDE
// constraint защищает от переноса на уже занятое время).
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { getBooking, getAvailability, rescheduleBooking, cancelBooking } from '@/utils/supabase/booking';

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DAYS_WINDOW = 14;

function bakuToday() {
  return new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
}
function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dowOf(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export default function Reschedule() {
  const { bookingId } = useLocalSearchParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [time, setTime] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getBooking(bookingId)
        .then((b) => {
          if (cancelled) return;
          setBooking(b);
          setAvailLoading(true);
          return getAvailability({ masterId: b.master_id, serviceId: b.service_id, from: bakuToday(), days: DAYS_WINDOW });
        })
        .then((map) => {
          if (cancelled || !map) return;
          setAvailability(map);
          const first = Object.keys(map).sort()[0];
          setSelectedDate(first || bakuToday());
        })
        .catch((e) => !cancelled && setError(e.message || 'Не удалось загрузить'))
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
            setAvailLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [bookingId])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }
  if (error || !booking) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Бронь не найдена'}</Text>
      </View>
    );
  }

  const dateList = Array.from({ length: DAYS_WINDOW }, (_, i) => addDaysISO(bakuToday(), i));
  const timesForSelected = (selectedDate && availability?.[selectedDate]) || [];

  async function handleSave() {
    if (!time) return;
    setSaving(true);
    setSaveError(null);
    try {
      await rescheduleBooking({ bookingId, date: selectedDate, start: time });
      router.replace('/(client-tabs)/bookings');
    } catch (e) {
      if (e.code === '23P01') {
        setSaveError('Этот слот только что заняли — выберите другое время.');
        setTime(null);
        setAvailLoading(true);
        getAvailability({ masterId: booking.master_id, serviceId: booking.service_id, from: bakuToday(), days: DAYS_WINDOW })
          .then(setAvailability)
          .finally(() => setAvailLoading(false));
      } else {
        setSaveError(e.message || 'Не удалось перенести бронь');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    Alert.alert('Отменить запись?', booking.service_name, [
      { text: 'Не отменять', style: 'cancel' },
      {
        text: 'Отменить запись',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelBooking(bookingId);
            router.replace('/(client-tabs)/bookings');
          } catch (e) {
            Alert.alert('Не удалось отменить', e.message || '');
            setCancelling(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <View style={styles.headerRow}>
          <PressableScale style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={17} color={COLORS.ink} />
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Перенести запись</Text>
            <Text style={styles.sub}>{booking.service_name}</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {saveError && <Text style={styles.errorInline}>{saveError}</Text>}

        {availLoading ? (
          <ActivityIndicator color={COLORS.indigo} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>Дата</Text>
            <View style={styles.dateGrid}>
              {dateList.map((iso) => {
                const count = availability?.[iso]?.length ?? 0;
                const off = count === 0;
                const on = selectedDate === iso;
                return (
                  <PressableScale
                    key={iso}
                    disabled={off}
                    style={[styles.dateCell, on && styles.dateCellActive, off && styles.dateCellOff]}
                    onPress={() => {
                      setSelectedDate(iso);
                      setTime(null);
                    }}
                  >
                    <Text style={[styles.dateDow, on && styles.dateTextActive]}>{DOW[dowOf(iso)]}</Text>
                    <Text style={[styles.dateNum, on && styles.dateTextActive, off && styles.dateTextOff]}>{iso.slice(8, 10)}</Text>
                  </PressableScale>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Время</Text>
            {timesForSelected.length === 0 ? (
              <Text style={styles.sub}>На этот день свободного времени не осталось.</Text>
            ) : (
              <View style={styles.timeGrid}>
                {timesForSelected.map((t) => {
                  const on = time === t;
                  return (
                    <PressableScale key={t} style={[styles.timeSlot, on && styles.timeSlotActive]} onPress={() => setTime(t)}>
                      <Text style={[styles.timeText, on && styles.timeTextActive]}>{t}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.ctaBar}>
        <PressableScale style={[styles.ctaButton, (!time || saving) && styles.ctaButtonOff]} disabled={!time || saving} onPress={handleSave}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.ctaText}>Перенести на выбранное время</Text>}
        </PressableScale>
        <PressableScale style={styles.cancelButton} disabled={cancelling} onPress={handleCancel}>
          {cancelling ? <ActivityIndicator color={COLORS.danger} /> : <Text style={styles.cancelText}>Отменить запись</Text>}
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, padding: SPACING.xl, textAlign: 'center' },
  errorInline: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, marginBottom: SPACING.md },
  headerBar: { paddingTop: 52, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  backButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.ink, letterSpacing: -0.3 },
  sub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  body: { padding: SPACING.xl, paddingBottom: 120 },
  sectionLabel: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.md, marginTop: SPACING.lg },
  dateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  dateCell: {
    width: '22.5%',
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
  },
  dateCellActive: { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo },
  dateCellOff: { borderColor: COLORS.border },
  dateDow: { fontFamily: FONT.semibold, fontSize: 11, color: COLORS.ink, opacity: 0.6 },
  dateNum: { fontFamily: FONT.extrabold, fontSize: 18, color: COLORS.ink, marginTop: 7, letterSpacing: -0.3 },
  dateTextActive: { color: COLORS.white, opacity: 1 },
  dateTextOff: { color: '#C3C8D4' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  timeSlot: {
    width: '22.5%',
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSlotActive: { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo },
  timeText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  timeTextActive: { color: COLORS.white },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingBottom: 26,
    backgroundColor: 'rgba(255,255,255,.94)',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  ctaButton: { height: 54, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  ctaButtonOff: { backgroundColor: '#E7E9F0' },
  ctaText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.white },
  cancelButton: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm },
  cancelText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.danger },
});
