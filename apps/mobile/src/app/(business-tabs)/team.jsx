// Команда — реальные мастера. Переключатель "выходной" пишет/удаляет
// строку master_exceptions(type='day_off') на сегодня — реальные данные,
// не визуальная имитация. Выручка за неделю/расписание в тексте из
// дизайна убраны без реального источника (services/masters пока не имеют
// своего экрана редактирования — Фаза 1.2, отдельная задача).
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { useAuthStore } from '@/utils/auth/store';
import { tintFor } from '@/utils/tint';
import { listMasters } from '@/utils/supabase/catalog';
import { setMasterDayOff, isMasterOffOn } from '@/utils/supabase/business';
import { bakuToday } from '@/components/DateTimeGrid';

export default function BusinessTeam() {
  const businessId = useAuthStore((s) => s.businessId);
  const [masters, setMasters] = useState([]);
  const [offToday, setOffToday] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    listMasters(businessId)
      .then(async (list) => {
        setMasters(list);
        const today = bakuToday();
        const flags = await Promise.all(list.map((m) => isMasterOffOn(m.id, today)));
        const map = {};
        list.forEach((m, i) => {
          map[m.id] = flags[i];
        });
        setOffToday(map);
      })
      .catch((e) => setError(e.message || 'Не удалось загрузить'))
      .finally(() => setLoading(false));
  }, [businessId]);

  useFocusEffect(load);

  async function toggle(masterId) {
    setTogglingId(masterId);
    const nextOff = !offToday[masterId];
    try {
      await setMasterDayOff(masterId, bakuToday(), nextOff);
      setOffToday((s) => ({ ...s, [masterId]: nextOff }));
    } catch (e) {
      setError(e.message || 'Не удалось изменить статус');
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }
  if (!businessId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Нет доступа к бизнесу — войдите под аккаунтом владельца</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Команда</Text>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.list}>
        {masters.length === 0 ? (
          <Text style={styles.emptyText}>В этом бизнесе пока нет мастеров.</Text>
        ) : (
          masters.map((m) => {
            const isOn = !offToday[m.id];
            return (
              <View key={m.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.avatar, { backgroundColor: tintFor(m.id)[0] }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name}>{m.name}</Text>
                    <Text style={styles.sub}>{isOn ? 'Работает сегодня' : 'Выходной сегодня'}</Text>
                  </View>
                  <Pressable
                    disabled={togglingId === m.id}
                    style={[styles.switchTrack, { backgroundColor: isOn ? COLORS.indigo : '#E2E5EC', justifyContent: isOn ? 'flex-end' : 'flex-start' }]}
                    onPress={() => toggle(m.id)}
                  >
                    {togglingId === m.id ? <ActivityIndicator size="small" color={COLORS.white} /> : <View style={styles.switchKnob} />}
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  title: { fontFamily: FONT.extrabold, fontSize: 25, color: COLORS.ink, letterSpacing: -0.5 },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, paddingHorizontal: SPACING.xl },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  list: { padding: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.md },
  card: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: SPACING.lg },
  cardTop: { flexDirection: 'row', gap: 13, alignItems: 'center' },
  avatar: { width: 54, height: 54, borderRadius: RADIUS.md },
  name: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.ink },
  sub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  switchTrack: { width: 48, height: 28, borderRadius: 14, padding: 3, flexDirection: 'row', alignItems: 'center' },
  switchKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.white },
});
