// Календарь — реальные брони по дням/мастерам. Отображаемое окно 09:00–21:00
// зафиксировано (а не вычислено из расписаний всех мастеров) — простое,
// но рабочее для типичного салона; # ponytail: если появится мастер с
// более ранним/поздним стартом, окно нужно будет считать динамически.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import PressableScale from '@/components/PressableScale';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { useAuthStore } from '@/utils/auth/store';
import { listMasters } from '@/utils/supabase/catalog';
import { listBusinessBookings, listBusinessHistory } from '@/utils/supabase/business';
import { bakuToday, addDaysISO } from '@/components/DateTimeGrid';
import { dowShort, dayMonthShort } from '@/utils/i18n/dates';
import { t, tn } from '@/utils/i18n';

const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1); // пилюля движется по экрану, не входит/выходит
const DISPLAY_START = 9 * 60;
const DISPLAY_END = 21 * 60;
const HOUR_H = 76;
const HOURS = Array.from({ length: (DISPLAY_END - DISPLAY_START) / 60 }, (_, i) => `${String(9 + i).padStart(2, '0')}:00`);

function localMinutes(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function dowOf(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

// Загружает мастеров + брони на выбранный день (и на всю неделю, если
// открыта вкладка "Неделя"). Обычный кастомный хук — вызывается
// безусловно на каждом рендере, как того требуют Rules of Hooks.
function useCalendarData(businessId, view, selectedDate) {
  const [masters, setMasters] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [weekBookings, setWeekBookings] = useState([]);
  const [historyBookings, setHistoryBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);

  const load = useCallback(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Спиннер на весь экран — только при первом заходе. Переключение
    // дня/недели или возврат на вкладку обновляют данные на месте, без
    // мигания пустым экраном (см. тот же приём в других вкладках).
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    const weekStart = bakuToday();
    Promise.all([
      listMasters(businessId),
      listBusinessBookings({ businessId, from: selectedDate, days: 1 }),
      view === 'week' ? listBusinessBookings({ businessId, from: weekStart, days: 7 }) : Promise.resolve([]),
      view === 'history' ? listBusinessHistory(businessId) : Promise.resolve([]),
    ])
      .then(([m, bk, wk, hist]) => {
        if (cancelled) return;
        setMasters(m);
        setBookings(bk);
        if (view === 'week') setWeekBookings(wk);
        if (view === 'history') setHistoryBookings(hist);
        loadedOnce.current = true;
      })
      .catch((e) => !cancelled && setError(friendlyError(e, t('common.20'))))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [businessId, view, selectedDate]);

  // Отдельно от useFocusEffect: с lazy:false вкладка монтируется сразу
  // после входа, но useFocusEffect не срабатывает, пока пользователь
  // реально не переключится на неё.
  useEffect(() => load(), [load]);

  useFocusEffect(load);

  return { masters, bookings, weekBookings, historyBookings, loading, error, reload: load };
}

export default function BusinessCalendar() {
  const businessId = useAuthStore((s) => s.businessId);
  const [view, setView] = useState('day');
  const [dayIdx, setDayIdx] = useState(0);
  const [segLayouts, setSegLayouts] = useState({}); // измерено onLayout, не пересчитывается на каждый кадр
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);

  useEffect(() => {
    const l = segLayouts[view];
    if (!l) return;
    pillX.set(withTiming(l.x, { duration: 250, easing: EASE_IN_OUT }));
    pillW.set(withTiming(l.width, { duration: 250, easing: EASE_IN_OUT }));
  }, [view, segLayouts]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.get() }], width: pillW.get() }));

  const dateList = Array.from({ length: 7 }, (_, i) => addDaysISO(bakuToday(), i));
  const selectedDate = dateList[dayIdx];

  const { masters: allMasters, bookings, weekBookings, historyBookings, loading, error, reload } = useCalendarData(businessId, view, selectedDate);
  // Мастер (staff) видит только свою колонку; брони других мастеров ему и
  // так не приходят с сервера (политика bookings в 0022).
  const staffMasterId = useAuthStore((s) => (s.role === 'staff' ? s.masterId : null));
  const masters = staffMasterId ? allMasters.filter((m) => m.id === staffMasterId) : allMasters;
  const masterName = useCallback((id) => masters.find((m) => m.id === id)?.name || t('common.21'), [masters]);

  // Любая активная запись открывает экран записи салона: заявка — принять /
  // другое время / отклонить; подтверждённая — позвонить, перенести,
  // отменить; прошедшая — «Пришёл / Не пришёл» (complete_booking).
  function handleBookingTap(b) {
    if (!['pending', 'proposed', 'confirmed'].includes(b.status)) return;
    router.push(`/booking-request/${b.id}`);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }
  if (error || !businessId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || t('common.25')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('common.26')}</Text>
          <View style={styles.segment}>
            {segLayouts.day && segLayouts.week && segLayouts.history && <Animated.View style={[styles.segPill, pillStyle]} />}
            <Pressable
              style={styles.segTab}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                setSegLayouts((s) => ({ ...s, day: { x, width } }));
              }}
              onPress={() => setView('day')}
            >
              <Text style={[styles.segText, view === 'day' && styles.segTextOn]}>{t('business_tabs_calendar.5')}</Text>
            </Pressable>
            <Pressable
              style={styles.segTab}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                setSegLayouts((s) => ({ ...s, week: { x, width } }));
              }}
              onPress={() => setView('week')}
            >
              <Text style={[styles.segText, view === 'week' && styles.segTextOn]}>{t('business_tabs_calendar.6')}</Text>
            </Pressable>
            <Pressable
              style={styles.segTab}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                setSegLayouts((s) => ({ ...s, history: { x, width } }));
              }}
              onPress={() => setView('history')}
            >
              <Text style={[styles.segText, view === 'history' && styles.segTextOn]}>{t('common.27')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Строка дней бессмысленна для "Истории" — там плоский список за
            всё время, а не окно в 7 дней вперёд от сегодня. */}
        {view !== 'history' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
            {dateList.map((iso, i) => (
              <PressableScale key={iso} style={[styles.dayChip, dayIdx === i && styles.dayChipOn]} onPress={() => setDayIdx(i)}>
                <Text style={[styles.dayDow, dayIdx === i && styles.dayTextOn]}>{dowShort(dowOf(iso))}</Text>
                <Text style={[styles.dayNum, dayIdx === i && styles.dayTextOn]}>{iso.slice(8, 10)}</Text>
              </PressableScale>
            ))}
          </ScrollView>
        )}
      </View>

      {view === 'day' ? (
        masters.length === 0 ? (
          <Text style={styles.emptyText}>{t('common.28')}</Text>
        ) : (
          <ScrollView>
            <View style={styles.staffHeader}>
              <View style={{ width: 44 }} />
              {masters.map((m) => (
                <View key={m.id} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.staffName}>{m.name}</Text>
                </View>
              ))}
            </View>

            <View style={styles.gridRow}>
              <View style={{ width: 44 }}>
                {HOURS.map((h) => (
                  <View key={h} style={{ height: HOUR_H }}>
                    <Text style={styles.hourLabel}>{h}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flex: 1, flexDirection: 'row', gap: 6, position: 'relative' }}>
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {HOURS.map((h) => (
                    <View key={h} style={{ height: HOUR_H, borderTopWidth: 1, borderTopColor: 'rgba(11,17,32,.06)' }} />
                  ))}
                </View>
                {masters.map((m) => (
                  <View key={m.id} style={{ flex: 1, position: 'relative', minHeight: HOURS.length * HOUR_H }}>
                    {bookings
                      // Заявки тоже занимают время мастера — показываем их в сетке,
                      // но пунктиром и янтарным цветом, чтобы не спутать с записью.
                      .filter((b) => b.master_id === m.id && ['pending', 'proposed', 'confirmed'].includes(b.status))
                      .map((b) => {
                        const startMin = localMinutes(b.starts_at);
                        const endMin = localMinutes(b.ends_at);
                        const top = ((startMin - DISPLAY_START) / 60) * HOUR_H;
                        const height = Math.max(((endMin - startMin) / 60) * HOUR_H - 3, 20);
                        const isPast = new Date(b.starts_at).getTime() < Date.now();
                        const isRequest = b.status !== 'confirmed';
                        return (
                          <PressableScale
                            key={b.id}
                            style={[
                              styles.block,
                              { top, height, backgroundColor: COLORS.indigo100, borderLeftColor: COLORS.indigo },
                              isRequest && styles.blockRequest,
                            ]}
                            onPress={() => handleBookingTap(b)}
                          >
                            <Text numberOfLines={1} style={styles.blockClient}>
                              {isRequest ? (b.status === 'pending' ? t('business_tabs_calendar.7') : t('business_tabs_calendar.8')) : ''}
                              {b.client_name || t('common.22')}
                            </Text>
                            {height > 40 && <Text numberOfLines={1} style={styles.blockService}>{b.service_name}</Text>}
                            {/* Точка-подсказка: прошедшую бронь можно тапнуть и отметить визит. */}
                            {isPast && height > 40 && <View style={styles.blockPastDot} />}
                          </PressableScale>
                        );
                      })}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        )
      ) : view === 'week' ? (
        <ScrollView contentContainerStyle={styles.weekList}>
          {dateList.map((iso) => {
            const dayBookings = weekBookings.filter(
              (b) => b.status === 'confirmed' && new Date(new Date(b.starts_at).getTime() + 4 * 3600000).toISOString().slice(0, 10) === iso
            );
            const revenue = dayBookings.reduce((sum, b) => sum + Number(b.price), 0);
            return (
              <View key={iso} style={styles.weekCard}>
                <View style={styles.weekRow}>
                  <Text style={styles.weekLabel}>
                    {dowShort(dowOf(iso))}, {dayMonthShort(Number(iso.slice(8, 10)), Number(iso.slice(5, 7)) - 1)}
                  </Text>
                  <Text style={styles.weekMeta}>
                    {tn('plural.bookings', dayBookings.length)} · {revenue} ₼
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : historyBookings.length === 0 ? (
        <Text style={styles.emptyText}>{t('business_tabs_calendar.10')}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.weekList}>
          {historyBookings.map((b) => {
            const isPast = new Date(b.starts_at).getTime() <= Date.now();
            const tappable = b.status === 'confirmed' && isPast;
            const { label, color } = historyStatus(b.status, isPast);
            return (
              <PressableScale
                key={b.id}
                style={styles.historyRow}
                disabled={!tappable}
                onPress={() => handleBookingTap(b)}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.weekLabel}>{b.client_name || t('common.22')}</Text>
                  <Text style={styles.historySub}>
                    {b.service_name} · {masterName(b.master_id)}
                  </Text>
                  <Text style={styles.historySub}>{formatHistoryDate(b.starts_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.weekLabel}>{b.price} ₼</Text>
                  <Text style={[styles.historyStatus, { color }]}>{label}</Text>
                </View>
              </PressableScale>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function historyStatus(status, isPast) {
  switch (status) {
    case 'completed':
      return { label: t('business_tabs_calendar.11'), color: COLORS.success };
    case 'no_show':
      return { label: t('common.29'), color: COLORS.danger };
    case 'cancelled':
      return { label: t('common.30'), color: COLORS.subLight };
    default:
      // status === 'confirmed', но время уже прошло — владелец ещё не
      // отметил визит (тап всё ещё открывает "Пришёл"/"Не пришёл").
      return isPast ? { label: t('business_tabs_calendar.12'), color: COLORS.warning } : { label: t('common.31'), color: COLORS.indigo };
  }
}

function formatHistoryDate(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}.${mm} · ${hh}:${min}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, padding: SPACING.xl, textAlign: 'center' },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, padding: SPACING.xl },
  headerBar: { paddingTop: 54, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  title: { fontFamily: FONT.extrabold, fontSize: 22, color: COLORS.ink, letterSpacing: -0.5 },
  segment: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: COLORS.surface, borderRadius: 13, position: 'relative' },
  // Пилюля абсолютно спозиционирована без детей — это тот самый разрешённый
  // случай для анимации width (recipe "Tab / segmented indicator"): ничего
  // вокруг не перестраивается, а borderRadius не смазывается, как при scaleX.
  segPill: { position: 'absolute', top: 4, bottom: 4, left: 0, backgroundColor: COLORS.white, borderRadius: 10, shadowColor: '#0B1120', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segTab: { height: 32, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: FONT.bold, fontSize: 12.5, color: COLORS.sub },
  segTextOn: { color: COLORS.ink },
  daysRow: { gap: SPACING.sm, marginTop: SPACING.md, paddingBottom: 2 },
  dayChip: { width: 52, paddingVertical: 9, borderRadius: 15, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' },
  dayChipOn: { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo },
  dayDow: { fontFamily: FONT.semibold, fontSize: 10.5, color: COLORS.ink, opacity: 0.65 },
  dayNum: { fontFamily: FONT.extrabold, fontSize: 15, color: COLORS.ink, marginTop: 5, letterSpacing: -0.3 },
  dayTextOn: { color: COLORS.white, opacity: 1 },
  staffHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  staffName: { fontFamily: FONT.bold, fontSize: 12.5, color: COLORS.ink },
  gridRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: SPACING.xxl },
  hourLabel: { fontFamily: FONT.semibold, fontSize: 10.5, color: COLORS.subLight, paddingTop: 6 },
  blockRequest: { backgroundColor: '#FFF4E0', borderLeftColor: COLORS.warning, borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.warning },
  block: { position: 'absolute', left: 0, right: 0, padding: 7, paddingHorizontal: 8, borderLeftWidth: 3, borderRadius: 11, overflow: 'hidden' },
  blockClient: { fontFamily: FONT.bold, fontSize: 11, color: COLORS.ink },
  blockService: { fontFamily: FONT.medium, fontSize: 10, color: '#5B6478', marginTop: 3 },
  blockPastDot: { position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.indigo },
  weekList: { padding: SPACING.xl, gap: SPACING.sm },
  weekCard: { padding: 14, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.lg, backgroundColor: COLORS.white },
  weekRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACING.md },
  weekLabel: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  weekMeta: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.white,
  },
  historySub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  historyStatus: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.xs },
});
