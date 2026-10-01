// Booking flow — полностью реальные данные. Услуга/мастер из Supabase,
// дата/время из get_availability, запись — через create_booking (RPC,
// EXCLUDE-constraint на bookings защищает от двойного бронирования).
import { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import { getBusiness, listServices, listMasters } from '@/utils/supabase/catalog';
import { getAvailability, createBooking } from '@/utils/supabase/booking';
import { useAuthStore } from '@/utils/auth/store';
import { registerForPush } from '@/utils/notifications';
import { friendlyError } from '@/utils/errors';
import PressableScale from '@/components/PressableScale';

const STEP_TITLES = ['Выберите услугу', 'Выберите мастера', 'Выберите дату', 'Выберите время'];
const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAYS_WINDOW = 14;

// Азербайджан — UTC+4 без перехода на летнее время (см. shared/time.js);
// та же арифметика здесь, потому что React Native не даёт надёжного
// доступа к базе IANA-таймзон на клиенте.
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
function formatBakuDateTime(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  return {
    dow: DOW[d.getUTCDay()],
    day: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()],
    time: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
  };
}

export default function Booking() {
  const params = useLocalSearchParams();
  const businessId = params.idx;
  const uid = useAuthStore((s) => s.uid);

  const [business, setBusiness] = useState(null);
  const [services, setServices] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Предвыбор со страницы мастера (master-info) — только при первой
  // загрузке, чтобы возврат на экран (например, после входа) не сбрасывал шаг.
  const prefilled = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getBusiness(businessId), listServices(businessId), listMasters(businessId)])
        .then(([b, s, m]) => {
          if (cancelled) return;
          setBusiness(b);
          setServices(s);
          setMasters(m);
          const initial = params.serviceId ? s.findIndex((x) => x.id === params.serviceId) : 0;
          setServiceIdx(initial >= 0 ? initial : 0);
          if (!prefilled.current && params.masterId) {
            prefilled.current = true;
            const mi = m.findIndex((x) => x.id === params.masterId);
            if (mi >= 0) {
              setMasterIdx(mi);
              // Услуга и мастер уже выбраны — сразу к выбору даты.
              if (initial >= 0 && params.serviceId) setStep(3);
            }
          }
        })
        .catch((e) => !cancelled && setError(friendlyError(e, 'Не удалось загрузить данные')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [businessId])
  );

  const [step, setStep] = useState(1);
  const [serviceIdx, setServiceIdx] = useState(0);
  const [masterIdx, setMasterIdx] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [time, setTime] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [confirmed, setConfirmed] = useState(null);

  const master = masterIdx === null ? null : masters[masterIdx];
  const service = services[serviceIdx] ?? services[0];

  const loadAvailability = useCallback(() => {
    if (!master || !service) return;
    setAvailLoading(true);
    setAvailError(null);
    getAvailability({ masterId: master.id, serviceId: service.id, from: bakuToday(), days: DAYS_WINDOW })
      .then((map) => {
        setAvailability(map);
        if (!selectedDate) {
          const firstFree = Object.keys(map).sort()[0];
          setSelectedDate(firstFree || bakuToday());
        }
      })
      .catch((e) => setAvailError(friendlyError(e, 'Не удалось загрузить свободное время')))
      .finally(() => setAvailLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master?.id, service?.id]);

  useEffect(() => {
    if (step === 3 && !availability) loadAvailability();
  }, [step, availability, loadAvailability]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }
  if (error || !business || services.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'В этом салоне пока нет услуг'}</Text>
      </View>
    );
  }

  const tint = tintFor(business.id);
  const dateList = Array.from({ length: DAYS_WINDOW }, (_, i) => addDaysISO(bakuToday(), i));
  const timesForSelected = (selectedDate && availability?.[selectedDate]) || [];

  const canNext = step === 1 ? true : step === 2 ? master !== null : step === 3 ? !!selectedDate : !!time;

  function stepBack() {
    if (step === 1) router.back();
    else setStep((s) => s - 1);
  }

  async function stepNext() {
    if (!canNext) return;
    if (step === 4) {
      // Гость свободно листает шаги 1-4 (услуга/мастер/дата/время читаются
      // без входа — see 0014_guest_catalog.sql), но саму запись создаёт
      // только authenticated (create_booking). Перехватываем здесь, а не
      // раньше — до этого момента нечего было защищать, это просмотр.
      if (!uid) {
        router.push({ pathname: '/(auth)/login', params: { redirect: `/booking/${businessId}` } });
        return;
      }
      setConfirming(true);
      setConfirmError(null);
      try {
        const booking = await createBooking({
          businessId: business.id,
          masterId: master.id,
          serviceId: service.id,
          date: selectedDate,
          start: time,
        });
        setConfirmed(booking);
      } catch (e) {
        if (e.code === '23P01') {
          setConfirmError('Этот слот только что заняли — выберите другое время.');
          setTime(null);
          setAvailability(null); // перезагрузится при возврате на шаг 3→4
          setStep(3);
        } else {
          setConfirmError(friendlyError(e, 'Не удалось создать бронь'));
        }
      } finally {
        setConfirming(false);
      }
    } else {
      setStep((s) => s + 1);
    }
  }

  if (confirmed) {
    return <ConfirmScreen business={business} tint={tint} booking={confirmed} onDone={() => router.replace('/(client-tabs)')} />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <View style={styles.headerRow}>
          <PressableScale style={styles.backButton} onPress={stepBack}>
            <ArrowLeft size={17} color={COLORS.ink} />
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{STEP_TITLES[step - 1]}</Text>
            <Text style={styles.stepSub}>
              Шаг {step} из 4 · {business.name}
            </Text>
          </View>
        </View>
        <View style={styles.progressRow}>
          {[1, 2, 3, 4].map((n) => (
            <View key={n} style={[styles.progressBar, { backgroundColor: n <= step ? COLORS.indigo : 'rgba(11,17,32,.1)' }]} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {confirmError && <Text style={styles.errorInline}>{confirmError}</Text>}

        {step === 1 && (
          <View style={{ gap: SPACING.sm }}>
            {services.map((v, i) => (
              <PressableScale key={v.id} style={[styles.row, serviceIdx === i && styles.rowActive]} onPress={() => setServiceIdx(i)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName}>{v.name}</Text>
                  <Text style={styles.rowSub}>{v.duration_min} мин</Text>
                </View>
                <Text style={styles.rowPrice}>{v.price} ₼</Text>
              </PressableScale>
            ))}
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: SPACING.sm }}>
            {masters.length === 0 ? (
              <Text style={styles.rowSub}>В этом салоне пока нет мастеров.</Text>
            ) : (
              masters.map((m, i) => (
                <PressableScale key={m.id} style={[styles.row, masterIdx === i && styles.rowActive]} onPress={() => setMasterIdx(i)}>
                  <View style={[styles.masterThumb, { backgroundColor: tintFor(m.id)[0] }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName}>{m.name}</Text>
                  </View>
                </PressableScale>
              ))
            )}
          </View>
        )}

        {step === 3 &&
          (availLoading ? (
            <ActivityIndicator color={COLORS.indigo} style={{ marginTop: SPACING.xl }} />
          ) : availError ? (
            <Text style={styles.errorInline}>{availError}</Text>
          ) : (
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
                    <Text style={[styles.dateFree, on && styles.dateTextActive, off && styles.dateTextOff]}>
                      {off ? '—' : `${count} слот${count === 1 ? '' : count < 5 ? 'а' : 'ов'}`}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          ))}

        {step === 4 &&
          (timesForSelected.length === 0 ? (
            <Text style={styles.rowSub}>На этот день свободного времени не осталось.</Text>
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
          ))}
      </ScrollView>

      <View style={styles.ctaBar}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText} numberOfLines={1}>
            {[service.name, master?.name, step >= 3 ? selectedDate : null, time].filter(Boolean).join(' · ') || 'Выберите услугу'}
          </Text>
          <Text style={styles.summaryPrice}>{service.price} ₼</Text>
        </View>
        <PressableScale
          style={[styles.ctaButton, (!canNext || confirming) && styles.ctaButtonOff]}
          onPress={stepNext}
          disabled={!canNext || confirming}
        >
          {confirming ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={[styles.ctaText, !canNext && styles.ctaTextOff]}>{step === 4 ? 'Подтвердить запись' : 'Далее'}</Text>
          )}
        </PressableScale>
      </View>
    </View>
  );
}

function ConfirmScreen({ business, tint, booking, onDone }) {
  // Момент максимальной очевидной пользы для просьбы разрешения на push —
  // клиент только что записался и хочет получить подтверждение/напоминание.
  // registerForPush() сама тихо no-op'ает при отказе/эмуляторе.
  useEffect(() => {
    registerForPush();
  }, []);

  const start = formatBakuDateTime(booking.starts_at);
  const receipt = [
    { k: 'Услуга', v: booking.service_name },
    { k: 'Дата', v: `${start.dow}, ${start.day} ${start.month}` },
    { k: 'Время', v: start.time },
  ];

  return (
    <View style={styles.confirmScreen}>
      <View style={styles.confirmIcon}>
        <Check size={30} color={COLORS.indigo} strokeWidth={2.2} />
      </View>
      <Text style={styles.confirmTitle}>Вы записаны</Text>
      <Text style={styles.confirmSub}>Оплата на месте.</Text>

      <View style={styles.receiptCard}>
        <View style={styles.receiptHeader}>
          <View style={[styles.receiptThumb, { backgroundColor: tint[0] }]} />
          <View>
            <Text style={styles.rowName}>{business.name}</Text>
            <Text style={styles.rowSub}>
              {business.city}
              {business.district ? ` · ${business.district}` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.divider} />
        {receipt.map((r) => (
          <View key={r.k} style={styles.receiptRow}>
            <Text style={styles.receiptKey}>{r.k}</Text>
            <Text style={styles.receiptVal}>{r.v}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={[styles.receiptRow, styles.receiptTotal]}>
          <Text style={styles.rowName}>Итого</Text>
          <Text style={styles.confirmPrice}>{booking.price} ₼</Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />
      <PressableScale style={styles.ctaButton} onPress={onDone}>
        <Text style={styles.ctaText}>Готово</Text>
      </PressableScale>
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
  stepTitle: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.ink, letterSpacing: -0.3 },
  stepSub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  progressRow: { flexDirection: 'row', gap: 5, marginTop: SPACING.md },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  body: { padding: SPACING.xl, paddingTop: SPACING.sm },
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
  dateFree: { fontFamily: FONT.semibold, fontSize: 9.5, color: COLORS.ink, opacity: 0.6, marginTop: 6 },
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
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, marginBottom: SPACING.sm },
  summaryText: { flex: 1, fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  summaryPrice: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.base, color: COLORS.ink },
  ctaButton: { height: 54, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  ctaButtonOff: { backgroundColor: '#E7E9F0' },
  ctaText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.white },
  ctaTextOff: { color: '#A9B0BE' },

  confirmScreen: { flex: 1, backgroundColor: COLORS.white, paddingTop: 88, paddingHorizontal: SPACING.xl, paddingBottom: 30 },
  confirmIcon: { width: 66, height: 66, borderRadius: RADIUS.xl, backgroundColor: COLORS.indigo50, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontFamily: FONT.extrabold, fontSize: 27, color: COLORS.ink, letterSpacing: -0.6, marginTop: 22 },
  confirmSub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub, marginTop: 8, lineHeight: 21 },
  receiptCard: { marginTop: 26, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, overflow: 'hidden' },
  receiptHeader: { flexDirection: 'row', gap: 13, alignItems: 'center', padding: 16 },
  receiptThumb: { width: 56, height: 56, borderRadius: RADIUS.md },
  divider: { height: 1, backgroundColor: COLORS.borderLight },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, padding: 13, paddingHorizontal: 16 },
  receiptKey: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  receiptVal: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink, textAlign: 'right' },
  receiptTotal: { backgroundColor: COLORS.surfaceAlt, paddingVertical: 15 },
  confirmPrice: { fontFamily: FONT.extrabold, fontSize: 16, color: COLORS.ink },
});
