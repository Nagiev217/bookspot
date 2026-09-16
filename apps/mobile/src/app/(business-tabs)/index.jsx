// Сегодня — реальный дашборд бизнеса. Баннер "заявки ждут ответа" и кнопка
// "Закрыть слот" из дизайна убраны: в нашей системе брони создаются сразу
// confirmed (нет статуса pending, платежей нет — не за что "подтверждать"
// вручную), а точечное закрытие слота — отдельная задача под
// master_exceptions/custom_hours, ещё не построена.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/utils/auth/store';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { getMyBusiness, listBusinessBookings } from '@/utils/supabase/business';
import { bakuToday } from '@/components/DateTimeGrid';

const DOW_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function formatTime(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function localDateOf(isoUtc) {
  return new Date(new Date(isoUtc).getTime() + 4 * 3600000).toISOString().slice(0, 10);
}
function formatDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DOW_FULL[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export default function BusinessToday() {
  const businessId = useAuthStore((s) => s.businessId);
  const [business, setBusiness] = useState(null);
  const [todayBookings, setTodayBookings] = useState([]);
  const [nextDay, setNextDay] = useState(null); // { date, bookings } — ближайший день с записями, если сегодня пусто
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!businessId) {
        setLoading(false);
        return;
      }
      let cancelled = false;
      const today = bakuToday();
      // Окно в 30 дней вперёд — чтобы найти ближайшую запись, если на
      // сегодня пусто. Один запрос вместо двух: KPI и список берутся из
      // одного и того же результата.
      Promise.all([getMyBusiness(businessId), listBusinessBookings({ businessId, from: today, days: 30 })])
        .then(([b, bk]) => {
          if (cancelled) return;
          setBusiness(b);
          const confirmed = bk.filter((x) => x.status === 'confirmed');
          const todays = confirmed.filter((x) => localDateOf(x.starts_at) === today);
          setTodayBookings(todays);
          if (todays.length === 0) {
            const upcoming = confirmed.find((x) => localDateOf(x.starts_at) > today);
            if (upcoming) {
              const date = localDateOf(upcoming.starts_at);
              setNextDay({ date, bookings: confirmed.filter((x) => localDateOf(x.starts_at) === date) });
            } else {
              setNextDay(null);
            }
          } else {
            setNextDay(null);
          }
        })
        .catch((e) => !cancelled && setError(e.message || 'Не удалось загрузить'))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [businessId])
  );

  const todayDate = new Date(Date.now() + 4 * 3600000);
  const dateLabel = `${DOW_FULL[todayDate.getUTCDay()]}, ${todayDate.getUTCDate()} ${MONTHS[todayDate.getUTCMonth()]}`;
  const revenue = todayBookings.reduce((sum, b) => sum + Number(b.price), 0);
  const showingNextDay = todayBookings.length === 0 && !!nextDay;
  const bookings = showingNextDay ? nextDay.bookings : todayBookings;

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
        <Text style={styles.errorText}>{error || 'Нет доступа к бизнесу — войдите под аккаунтом владельца'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.dateText}>{dateLabel}</Text>
          <Text style={styles.title}>{business?.name}</Text>
        </View>
        <View style={styles.avatarPlaceholder} />
      </View>

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{todayBookings.length}</Text>
          <Text style={styles.kpiLabel}>Записей сегодня</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{revenue} ₼</Text>
          <Text style={styles.kpiLabel}>Выручка</Text>
        </View>
      </View>

      <Pressable style={styles.quickButton} onPress={() => router.push(`/manual-booking/${businessId}`)}>
        <Text style={styles.quickButtonText}>+ Запись вручную</Text>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {showingNextDay ? `Ближайшая запись — ${formatDateLabel(nextDay.date)}` : 'Расписание на сегодня'}
        </Text>
        <Pressable onPress={() => router.push('/(business-tabs)/calendar')}>
          <Text style={styles.sectionLink}>Календарь</Text>
        </Pressable>
      </View>

      {bookings.length === 0 ? (
        <Text style={styles.emptyText}>Записей пока нет.</Text>
      ) : (
        bookings.map((b) => (
          <View key={b.id} style={styles.agendaRow}>
            <Text style={styles.agendaTime}>{formatTime(b.starts_at)}</Text>
            <View style={styles.agendaCard}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.agendaClient}>{b.client_name || 'Без имени'}</Text>
                <Text style={styles.agendaService}>{b.service_name}</Text>
              </View>
              <Text style={styles.agendaPrice}>{b.price} ₼</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, padding: SPACING.xl, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl },
  dateText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  title: { fontFamily: FONT.extrabold, fontSize: 25, color: COLORS.ink, letterSpacing: -0.5, marginTop: 6 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  kpiRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.xl, marginTop: SPACING.lg },
  kpiCard: { flex: 1, padding: 14, paddingHorizontal: 12, borderRadius: 20, backgroundColor: COLORS.surfaceAlt },
  kpiValue: { fontFamily: FONT.extrabold, fontSize: 19, color: COLORS.ink, letterSpacing: -0.3 },
  kpiLabel: { fontFamily: FONT.medium, fontSize: 11, color: COLORS.sub, marginTop: 6 },
  quickButton: { height: 46, marginTop: SPACING.md, marginHorizontal: SPACING.xl, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(11,17,32,.1)', alignItems: 'center', justifyContent: 'center' },
  quickButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: SPACING.xxl, marginBottom: SPACING.md, paddingHorizontal: SPACING.xl },
  sectionTitle: { fontFamily: FONT.bold, fontSize: 17, color: COLORS.ink, letterSpacing: -0.3 },
  sectionLink: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.indigo },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, paddingHorizontal: SPACING.xl },
  agendaRow: { flexDirection: 'row', gap: SPACING.md, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  agendaTime: { width: 46, fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink, paddingTop: 13 },
  agendaCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: 12, paddingHorizontal: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceAlt, borderLeftWidth: 3, borderLeftColor: COLORS.indigo },
  agendaClient: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  agendaService: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: '#5B6478', marginTop: 3 },
  agendaPrice: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
});
