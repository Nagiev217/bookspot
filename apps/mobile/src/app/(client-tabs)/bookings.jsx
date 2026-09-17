// Мои записи — реальные данные из Supabase. "Маршрут" — как в исходном
// дизайне (открывает страницу салона; нет geo-координат/карты в схеме,
// чтобы построить настоящий маршрут). Отмена перенесена на экран "Перенести".
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { router, useFocusEffect } from 'expo-router';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import { listMyBookings } from '@/utils/supabase/booking';

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatBaku(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  return `${DOW[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export default function Bookings() {
  const [tab, setTab] = useState('up');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);

  const load = useCallback(() => {
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    listMyBookings()
      .then((data) => {
        setBookings(data);
        loadedOnce.current = true;
      })
      .catch((e) => setError(e.message || 'Не удалось загрузить записи'))
      .finally(() => setLoading(false));
  }, []);

  // Отдельно от useFocusEffect: с lazy:false в (client-tabs)/_layout.jsx
  // эта вкладка монтируется сразу после входа, но useFocusEffect не
  // срабатывает, пока пользователь реально на неё не переключится — без
  // этого эффекта первый переход всё равно ждал бы сеть. useFocusEffect
  // ниже по-прежнему обновляет список при каждом возврате на вкладку.
  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(load);

  const now = Date.now();
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && new Date(b.starts_at).getTime() >= now);
  const past = bookings.filter((b) => b.status !== 'confirmed' || new Date(b.starts_at).getTime() < now);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Мои записи</Text>
        <View style={styles.segment}>
          <PressableScale style={[styles.segTab, tab === 'up' && styles.segTabOn]} onPress={() => setTab('up')}>
            <Text style={[styles.segText, tab === 'up' && styles.segTextOn]}>Предстоящие</Text>
          </PressableScale>
          <PressableScale style={[styles.segTab, tab === 'past' && styles.segTabOn]} onPress={() => setTab('past')}>
            <Text style={[styles.segText, tab === 'past' && styles.segTextOn]}>История</Text>
          </PressableScale>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={COLORS.indigo} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : tab === 'up' ? (
        <ScrollView contentContainerStyle={styles.list}>
          {upcoming.length === 0 ? (
            <Text style={styles.emptyText}>Пока нет предстоящих записей.</Text>
          ) : (
            upcoming.map((b) => (
              <View key={b.id} style={styles.upcomingCard}>
                <View style={styles.upcomingHeader}>
                  <View style={styles.dot} />
                  <Text style={styles.whenText}>{formatBaku(b.starts_at)}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.statusText}>Подтверждено</Text>
                </View>
                <PressableScale style={styles.upcomingBody} onPress={() => router.push(`/salon/${b.business_id}`)}>
                  <View style={[styles.thumb, { backgroundColor: tintFor(b.business_id)[0] }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.salonName}>{b.businesses?.name}</Text>
                    <Text style={styles.subText}>{b.service_name}</Text>
                  </View>
                  <Text style={styles.priceText}>{b.price} ₼</Text>
                </PressableScale>
                <View style={styles.upcomingActions}>
                  <PressableScale style={styles.outlineButton} onPress={() => router.push(`/reschedule/${b.id}`)}>
                    <Text style={styles.outlineButtonText}>Перенести</Text>
                  </PressableScale>
                  <PressableScale style={styles.darkButton} onPress={() => router.push(`/salon/${b.business_id}`)}>
                    <Text style={styles.darkButtonText}>Маршрут</Text>
                  </PressableScale>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {past.length === 0 ? (
            <Text style={styles.emptyText}>Истории пока нет.</Text>
          ) : (
            past.map((b) => (
              <PressableScale key={b.id} style={styles.pastRow} onPress={() => router.push(`/salon/${b.business_id}`)}>
                <View style={[styles.pastThumb, { backgroundColor: tintFor(b.business_id)[0] }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.salonName}>{b.businesses?.name}</Text>
                  <Text style={styles.subText}>
                    {b.service_name} · {formatBaku(b.starts_at)}
                  </Text>
                  <Text style={styles.statusMuted}>{statusLabel(b.status)}</Text>
                </View>
              </PressableScale>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function statusLabel(status) {
  switch (status) {
    case 'cancelled':
      return 'Отменена';
    case 'completed':
      return 'Завершена';
    case 'no_show':
      return 'Неявка';
    default:
      return status;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  header: { paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  title: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xxl, color: COLORS.ink, letterSpacing: -0.6 },
  segment: { flexDirection: 'row', gap: 4, marginTop: SPACING.lg, padding: 4, backgroundColor: COLORS.surface, borderRadius: 14 },
  segTab: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segTabOn: { backgroundColor: COLORS.white, shadowColor: '#0B1120', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.sub },
  segTextOn: { color: COLORS.ink },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, margin: SPACING.xl },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, padding: SPACING.xl },
  list: { padding: SPACING.xl, gap: SPACING.md },
  upcomingCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, overflow: 'hidden' },
  upcomingHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md, paddingHorizontal: 16, backgroundColor: COLORS.indigo100 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.indigo },
  whenText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.indigo },
  statusText: { fontFamily: FONT.semibold, fontSize: 11.5, color: COLORS.sub },
  upcomingBody: { flexDirection: 'row', gap: 13, alignItems: 'center', padding: 16 },
  thumb: { width: 58, height: 58, borderRadius: RADIUS.md },
  salonName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.ink },
  subText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  statusMuted: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.xs, color: COLORS.subLight, marginTop: 4 },
  priceText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  upcomingActions: { flexDirection: 'row', gap: SPACING.sm, padding: 16, paddingTop: 0 },
  outlineButton: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center' },
  outlineButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  darkButton: { flex: 1, height: 44, borderRadius: 14, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  darkButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
  pastRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center', padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.md },
  pastThumb: { width: 54, height: 54, borderRadius: 17, opacity: 0.75 },
});
