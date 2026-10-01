// Заявка клиента (0029) — экран ответа салона: принять, предложить другое
// время из свободного у этого мастера или отклонить. Открывается из списка
// заявок на «Сегодня», из календаря и по push «Новая заявка».
// Ответить может мастер этой записи (со своим логином) или владелец салона —
// это же проверяет сервер (require_booking_staff).
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Phone } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { getBookingRequest } from '@/utils/supabase/business';
import { getAvailability, acceptBooking, declineBooking, proposeBookingTime } from '@/utils/supabase/booking';
import { bakuToday, addDaysISO } from '@/components/DateTimeGrid';
import { friendlyError } from '@/utils/errors';

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAYS_WINDOW = 14;

function bakuDate(isoUtc) {
  return new Date(new Date(isoUtc).getTime() + 4 * 3600000);
}
function formatWhen(isoUtc) {
  const d = bakuDate(isoUtc);
  return `${DOW[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${formatTime(isoUtc)}`;
}
function formatTime(isoUtc) {
  const d = bakuDate(isoUtc);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function dowOf(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export default function BookingRequest() {
  const { bookingId } = useLocalSearchParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // 'accept' | 'decline' | 'propose'
  const [actionError, setActionError] = useState(null);

  // Выбор другого времени — раскрывается по кнопке, как экран переноса.
  const [proposing, setProposing] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [time, setTime] = useState(null);

  const load = useCallback(() => {
    let cancelled = false;
    getBookingRequest(bookingId)
      .then((b) => !cancelled && setBooking(b))
      .catch((e) => !cancelled && setError(friendlyError(e, 'Не удалось загрузить заявку')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  useFocusEffect(load);

  function loadAvailability(b) {
    setAvailLoading(true);
    setTime(null);
    getAvailability({ masterId: b.master_id, serviceId: b.service_id, from: bakuToday(), days: DAYS_WINDOW })
      .then((map) => {
        setAvailability(map);
        // По умолчанию — день заявки, если в нём есть свободное время.
        const requestedDay = bakuDate(b.starts_at).toISOString().slice(0, 10);
        const days = Object.keys(map).sort();
        setSelectedDate(map[requestedDay]?.length ? requestedDay : days[0] || bakuToday());
      })
      .catch((e) => setActionError(friendlyError(e, 'Не удалось загрузить свободное время')))
      .finally(() => setAvailLoading(false));
  }

  async function run(kind, action, after) {
    setBusy(kind);
    setActionError(null);
    try {
      await action();
      after?.();
    } catch (e) {
      setActionError(friendlyError(e));
      // Заявку могли закрыть параллельно (клиент отменил, истёк срок) —
      // перечитываем, чтобы экран показал актуальный статус.
      load();
    } finally {
      setBusy(null);
    }
  }

  function handleAccept() {
    run('accept', () => acceptBooking(bookingId), () => {
      Alert.alert('Запись подтверждена', 'Клиент получит уведомление.');
      router.back();
    });
  }

  function handleDecline() {
    Alert.alert(
      booking.status === 'proposed' ? 'Отозвать предложение?' : 'Отклонить заявку?',
      'Клиент получит уведомление, время освободится. Лучше предложить другое время — так клиент не уйдёт.',
      [
        { text: 'Назад', style: 'cancel' },
        {
          text: 'Отклонить',
          style: 'destructive',
          onPress: () => run('decline', () => declineBooking(bookingId), () => router.back()),
        },
      ]
    );
  }

  function handlePropose() {
    if (!time) return;
    run(
      'propose',
      () => proposeBookingTime({ bookingId, date: selectedDate, start: time }),
      () => {
        Alert.alert('Время предложено', 'Клиент получит уведомление и выберет: принять или отказаться.');
        router.back();
      }
    );
  }

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
        <Text style={styles.errorText}>{error || 'Заявка не найдена'}</Text>
      </View>
    );
  }

  const isPending = booking.status === 'pending';
  const isProposed = booking.status === 'proposed';
  const isOpen = isPending || isProposed;
  const dateList = Array.from({ length: DAYS_WINDOW }, (_, i) => addDaysISO(bakuToday(), i));
  const timesForSelected = (selectedDate && availability?.[selectedDate]) || [];

  const rows = [
    { k: 'Услуга', v: booking.service_name },
    { k: 'Мастер', v: booking.masters?.name || '—' },
    { k: 'Стоимость', v: `${booking.price} ₼` },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Назад">
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
        <Text style={styles.title}>
          {isProposed ? 'Ждём ответа клиента' : isPending ? 'Новая заявка' : booking.status === 'confirmed' ? 'Запись подтверждена' : 'Заявка закрыта'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.whenCard, isPending && styles.whenCardPending]}>
          <Text style={[styles.whenLabel, isPending && { color: COLORS.warning }]}>
            {isProposed ? 'Вы предложили' : isPending ? 'Клиент хочет' : 'Время'}
          </Text>
          <Text style={styles.whenText}>{formatWhen(booking.starts_at)}</Text>
          {isProposed && booking.requested_starts_at && (
            <Text style={styles.whenSub}>вместо {formatWhen(booking.requested_starts_at)}</Text>
          )}
          {isOpen && booking.expires_at && (
            <Text style={styles.whenSub}>
              {isPending ? `Ответьте до ${formatTime(booking.expires_at)} — иначе заявка отменится` : `Клиент ответит до ${formatTime(booking.expires_at)}`}
            </Text>
          )}
        </View>

        <View style={styles.clientRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.clientName}>{booking.client_name || 'Клиент'}</Text>
            {booking.client_phone ? <Text style={styles.clientPhone}>{booking.client_phone}</Text> : null}
          </View>
          {booking.client_phone ? (
            <PressableScale
              style={styles.callButton}
              onPress={() => Linking.openURL(`tel:${booking.client_phone}`).catch(() => {})}
              accessibilityLabel="Позвонить клиенту"
            >
              <Phone size={18} color={COLORS.indigo} />
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.detailsCard}>
          {rows.map((r) => (
            <View key={r.k} style={styles.detailRow}>
              <Text style={styles.detailKey}>{r.k}</Text>
              <Text style={styles.detailVal}>{r.v}</Text>
            </View>
          ))}
        </View>

        {actionError && <Text style={styles.errorInline}>{actionError}</Text>}

        {isPending && proposing && (
          <>
            <Text style={styles.sectionTitle}>Другое время</Text>
            {availLoading ? (
              <ActivityIndicator color={COLORS.indigo} style={{ marginTop: SPACING.lg }} />
            ) : (
              <>
                <View style={styles.dateGrid}>
                  {dateList.map((iso) => {
                    const off = !(availability?.[iso]?.length > 0);
                    const on = selectedDate === iso;
                    return (
                      <PressableScale
                        key={iso}
                        disabled={off}
                        style={[styles.dateCell, on && styles.cellActive]}
                        onPress={() => {
                          setSelectedDate(iso);
                          setTime(null);
                        }}
                      >
                        <Text style={[styles.dateDow, on && styles.textActive]}>{DOW[dowOf(iso)]}</Text>
                        <Text style={[styles.dateNum, on && styles.textActive, off && styles.textOff]}>{iso.slice(8, 10)}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
                {timesForSelected.length === 0 ? (
                  <Text style={styles.muted}>В этот день у мастера нет свободного времени.</Text>
                ) : (
                  <View style={[styles.timeGrid, { marginTop: SPACING.md }]}>
                    {timesForSelected.map((t) => {
                      const on = time === t;
                      return (
                        <PressableScale key={t} style={[styles.timeSlot, on && styles.cellActive]} onPress={() => setTime(t)}>
                          <Text style={[styles.timeText, on && styles.textActive]}>{t}</Text>
                        </PressableScale>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </>
        )}

        {!isOpen && (
          <Text style={styles.muted}>
            {booking.status === 'confirmed'
              ? 'Запись уже в календаре.'
              : 'Заявка закрыта: её отменили или истёк срок ответа.'}
          </Text>
        )}
      </ScrollView>

      {isOpen && (
        <View style={styles.ctaBar}>
          {isPending && !proposing && (
            <>
              <PressableScale style={styles.primaryButton} onPress={handleAccept} disabled={!!busy}>
                {busy === 'accept' ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryText}>Принять</Text>}
              </PressableScale>
              <View style={styles.secondaryRow}>
                <PressableScale
                  style={styles.outlineButton}
                  disabled={!!busy}
                  onPress={() => {
                    setProposing(true);
                    loadAvailability(booking);
                  }}
                >
                  <Text style={styles.outlineText}>Другое время</Text>
                </PressableScale>
                <PressableScale style={styles.dangerButton} disabled={!!busy} onPress={handleDecline}>
                  {busy === 'decline' ? <ActivityIndicator color={COLORS.danger} /> : <Text style={styles.dangerText}>Отклонить</Text>}
                </PressableScale>
              </View>
            </>
          )}
          {isPending && proposing && (
            <>
              <PressableScale style={[styles.primaryButton, !time && styles.buttonOff]} onPress={handlePropose} disabled={!time || !!busy}>
                {busy === 'propose' ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.primaryText}>{time ? `Предложить ${time}` : 'Выберите время'}</Text>
                )}
              </PressableScale>
              <PressableScale style={styles.textButton} onPress={() => setProposing(false)} disabled={!!busy}>
                <Text style={styles.outlineText}>Назад к заявке</Text>
              </PressableScale>
            </>
          )}
          {isProposed && (
            <PressableScale style={styles.dangerButtonWide} disabled={!!busy} onPress={handleDecline}>
              {busy === 'decline' ? <ActivityIndicator color={COLORS.danger} /> : <Text style={styles.dangerText}>Отозвать предложение</Text>}
            </PressableScale>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, padding: SPACING.xl, textAlign: 'center' },
  errorInline: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, marginTop: SPACING.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  backButton: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, letterSpacing: -0.4 },
  body: { padding: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: 190 },
  whenCard: { padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: COLORS.indigo100 },
  whenCardPending: { backgroundColor: '#FFF4E0' },
  whenLabel: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.indigo },
  whenText: { fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, letterSpacing: -0.4, marginTop: 6 },
  whenSub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: '#5B6478', marginTop: 6 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.lg },
  clientName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.lg, color: COLORS.ink },
  clientPhone: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  callButton: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.indigo50, alignItems: 'center', justifyContent: 'center' },
  detailsCard: { marginTop: SPACING.lg, padding: SPACING.lg, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  detailKey: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub },
  detailVal: { flexShrink: 1, textAlign: 'right', fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  sectionTitle: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.ink, letterSpacing: -0.3, marginTop: SPACING.xxl, marginBottom: SPACING.md },
  muted: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: SPACING.md },
  dateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  dateCell: { width: '22.5%', paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' },
  dateDow: { fontFamily: FONT.semibold, fontSize: 11, color: COLORS.ink, opacity: 0.6 },
  dateNum: { fontFamily: FONT.extrabold, fontSize: 18, color: COLORS.ink, marginTop: 7, letterSpacing: -0.3 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  timeSlot: { width: '22.5%', height: 44, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  timeText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  cellActive: { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo },
  textActive: { color: COLORS.white, opacity: 1 },
  textOff: { color: '#C3C8D4' },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: SPACING.sm,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingBottom: 26,
    backgroundColor: 'rgba(255,255,255,.96)',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  primaryButton: { height: 52, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.white },
  buttonOff: { backgroundColor: COLORS.subLight },
  secondaryRow: { flexDirection: 'row', gap: SPACING.sm },
  outlineButton: { flex: 1, height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center' },
  outlineText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  dangerButton: { flex: 1, height: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(208,65,47,.35)', alignItems: 'center', justifyContent: 'center' },
  dangerButtonWide: { height: 50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(208,65,47,.35)', alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.danger },
  textButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
