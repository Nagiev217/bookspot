// Карточка салона для admin: продлить подписку после оплаты в WhatsApp,
// заблокировать/разблокировать, сбросить пароль владельцу.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import CredentialsCard from '@/components/CredentialsCard';
import {
  listAllBusinessesAdmin,
  setSubscription,
  setBusinessStatus,
  resetPassword,
  subscriptionBadge,
  bakuTodayISO,
  addMonthsISO,
  formatDateRu,
} from '@/utils/supabase/admin';
import { friendlyError } from '@/utils/errors';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

const EXTEND = [1, 3, 6, 12];

export default function AdminBusinessCard() {
  const { id } = useLocalSearchParams();
  const [b, setB] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState(null);

  const load = useCallback(() => {
    listAllBusinessesAdmin()
      .then((list) => setB(list.find((x) => x.id === id) ?? null))
      .catch((e) => Alert.alert('Ошибка', friendlyError(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(load);

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      load();
    } catch (e) {
      Alert.alert('Не получилось', friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  // Продление считается от даты окончания, а если подписка уже истекла или
  // её не было — от сегодня, чтобы оплаченные месяцы не «сгорали».
  function extend(months) {
    const today = bakuTodayISO();
    const from = b.paid_until && b.paid_until > today ? b.paid_until : today;
    const next = addMonthsISO(from, months);
    Alert.alert('Продлить подписку?', `«${b.name}» — до ${formatDateRu(next)}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Продлить', onPress: () => run(() => setSubscription(b.id, next)) },
    ]);
  }

  function toggleBlock() {
    const blocking = b.status === 'active';
    Alert.alert(
      blocking ? 'Заблокировать салон?' : 'Разблокировать салон?',
      blocking ? 'Салон пропадёт из каталога и перестанет принимать записи. Уже созданные записи сохранятся.' : 'Салон снова появится в каталоге.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: blocking ? 'Заблокировать' : 'Разблокировать', style: blocking ? 'destructive' : 'default', onPress: () => run(() => setBusinessStatus(b.id, blocking ? 'blocked' : 'active')) },
      ]
    );
  }

  function resetOwner() {
    Alert.alert('Сбросить пароль владельцу?', 'Старый пароль перестанет работать. Новый временный нужно будет отправить владельцу.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сбросить',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            const res = await resetPassword(b.owner_id);
            setCreds(res);
          }),
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }
  if (!b) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Салон не найден</Text>
      </View>
    );
  }

  const badge = subscriptionBadge(b);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <PressableScale style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{b.name}</Text>
          <Text style={styles.muted}>{[b.city, b.district].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Подписка</Text>
        <Text style={styles.big}>{badge.label}</Text>
        <Text style={styles.label}>Продлить на</Text>
        <View style={styles.chips}>
          {EXTEND.map((m) => (
            <PressableScale key={m} style={styles.chip} onPress={() => extend(m)} disabled={busy}>
              <Text style={styles.chipText}>+{m} мес.</Text>
            </PressableScale>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Владелец</Text>
        <Text style={styles.value}>{b.owner_name || '—'}</Text>
        <Text style={styles.muted} selectable>{b.owner_email || '—'}</Text>
        {b.owner_phone ? <Text style={styles.muted} selectable>{b.owner_phone}</Text> : null}
        <PressableScale style={styles.outline} onPress={resetOwner} disabled={busy}>
          <Text style={styles.outlineText}>Сбросить пароль владельцу</Text>
        </PressableScale>
      </View>

      {creds && (
        <CredentialsCard
          title="Новый временный пароль"
          name={b.owner_name}
          email={creds.email}
          password={creds.password}
          phone={b.owner_phone || b.phone}
          businessName={b.name}
        />
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Салон</Text>
        <Text style={styles.muted}>Ближайших записей: {b.upcoming_bookings}</Text>
        <PressableScale style={styles.outline} onPress={() => router.push(`/salon/${b.id}`)}>
          <Text style={styles.outlineText}>Открыть страницу салона</Text>
        </PressableScale>
        <PressableScale style={[styles.outline, b.status === 'active' && styles.danger]} onPress={toggleBlock} disabled={busy}>
          <Text style={[styles.outlineText, b.status === 'active' && { color: COLORS.danger }]}>
            {b.status === 'active' ? 'Заблокировать' : 'Разблокировать'}
          </Text>
        </PressableScale>
      </View>

      {busy && <ActivityIndicator color={COLORS.indigo} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: SPACING.xl, paddingTop: 56, gap: SPACING.md, backgroundColor: COLORS.white, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.sm },
  back: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xl, color: COLORS.ink, letterSpacing: -0.5 },
  muted: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  card: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.sm },
  cardTitle: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  big: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.lg, color: COLORS.ink },
  value: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.ink },
  label: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: SPACING.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.pill, backgroundColor: COLORS.indigo50 },
  chipText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.indigo },
  outline: { height: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center', marginTop: SPACING.xs },
  outlineText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  danger: { borderColor: 'rgba(208,65,47,.35)' },
});
