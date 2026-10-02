// Мои записи — реальные данные из Supabase. "Маршрут" — как в исходном
// дизайне (открывает страницу салона; нет geo-координат/карты в схеме,
// чтобы построить настоящий маршрут). Отмена перенесена на экран "Перенести".
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import PressableScale from '@/components/PressableScale';
import { router, useFocusEffect } from 'expo-router';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import { listMyBookings, respondToProposal, ACTIVE_STATUSES } from '@/utils/supabase/booking';
import { friendlyError } from '@/utils/errors';
import { useAuthStore } from '@/utils/auth/store';
import SignInPrompt from '@/components/SignInPrompt';
import StarBadge from '@/components/StarBadge';
import { dowShort, dayMonthShort } from '@/utils/i18n/dates';
import { t } from '@/utils/i18n';

// PostgREST может вернуть обратную embedded-связь (reviews.booking_id —
// unique FK) и как массив, и как одиночный объект в зависимости от версии —
// нормализуем здесь один раз, а не гадаем формат в разметке.
function myReviewOf(booking) {
  const r = booking.reviews;
  if (!r) return null;
  return Array.isArray(r) ? r[0] || null : r;
}


function formatTimeBaku(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// Шапка карточки предстоящей записи по статусу заявки (0029).
function upcomingStatus(b) {
  if (b.status === 'pending') {
    return {
      label: t('client_tabs_bookings.1'),
      color: COLORS.warning,
      bg: '#FFF4E0',
      hint: b.expires_at ? t('client_tabs_bookings.2', { p0: formatTimeBaku(b.expires_at) }) : null,
    };
  }
  if (b.status === 'proposed') {
    return { label: t('common.38'), color: COLORS.indigo, bg: COLORS.indigo100, hint: null };
  }
  return { label: t('common.31'), color: COLORS.indigo, bg: COLORS.indigo100, hint: null };
}

function formatBaku(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  return `${dowShort(d.getUTCDay())}, ${dayMonthShort(d.getUTCDate(), d.getUTCMonth())} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export default function Bookings() {
  const uid = useAuthStore((s) => s.uid);
  const [tab, setTab] = useState('up');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [respondingId, setRespondingId] = useState(null);
  const loadedOnce = useRef(false);

  const load = useCallback(() => {
    // Без входа listMyBookings() тихо вернёт [] под RLS (auth.uid() = null
    // не совпадёт ни с одной записью) — не запрос, а гейт ниже до сети.
    if (!uid) {
      setLoading(false);
      return;
    }
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    listMyBookings()
      .then((data) => {
        setBookings(data);
        loadedOnce.current = true;
      })
      .catch((e) => setError(friendlyError(e, t('client_tabs_bookings.3'))))
      .finally(() => setLoading(false));
  }, [uid]);

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
  const isUpcoming = (b) => ACTIVE_STATUSES.includes(b.status) && new Date(b.starts_at).getTime() >= now;
  // Предстоящие — по возрастанию времени: ближайший визит первым.
  const upcoming = bookings.filter(isUpcoming).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = bookings.filter((b) => !isUpcoming(b));

  async function respond(b, accept) {
    setRespondingId(b.id);
    try {
      await respondToProposal(b.id, accept);
      load();
    } catch (e) {
      Alert.alert(t('common.39'), friendlyError(e));
    } finally {
      setRespondingId(null);
    }
  }

  function confirmDecline(b) {
    Alert.alert(t('client_tabs_bookings.4'), t('client_tabs_bookings.5'), [
      { text: t('common.40'), style: 'cancel' },
      { text: t('client_tabs_bookings.6'), style: 'destructive', onPress: () => respond(b, false) },
    ]);
  }

  if (!loading && !uid) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('client_tabs_bookings.7')}</Text>
        </View>
        <SignInPrompt
          title={t('client_tabs_bookings.8')}
          subtitle={t('client_tabs_bookings.9')}
          redirect="/(client-tabs)/bookings"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('client_tabs_bookings.7')}</Text>
        <View style={styles.segment}>
          <PressableScale style={[styles.segTab, tab === 'up' && styles.segTabOn]} onPress={() => setTab('up')}>
            <Text style={[styles.segText, tab === 'up' && styles.segTextOn]}>{t('client_tabs_bookings.10')}</Text>
          </PressableScale>
          <PressableScale style={[styles.segTab, tab === 'past' && styles.segTabOn]} onPress={() => setTab('past')}>
            <Text style={[styles.segText, tab === 'past' && styles.segTextOn]}>{t('common.27')}</Text>
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
            <Text style={styles.emptyText}>{t('client_tabs_bookings.11')}</Text>
          ) : (
            upcoming.map((b) => {
              const st = upcomingStatus(b);
              const busy = respondingId === b.id;
              return (
              <View key={b.id} style={styles.upcomingCard}>
                <View style={[styles.upcomingHeader, { backgroundColor: st.bg }]}>
                  <View style={[styles.dot, { backgroundColor: st.color }]} />
                  <Text style={[styles.whenText, { color: st.color }]}>{formatBaku(b.starts_at)}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                </View>
                {b.status === 'proposed' && (
                  <Text style={styles.proposalText}>
                    {b.requested_starts_at
                      ? t('bookings.proposal', { master: b.masters?.name || t('common.21'), from: formatBaku(b.requested_starts_at), to: formatBaku(b.starts_at) })
                      : t('bookings.proposalNoFrom', { master: b.masters?.name || t('common.21'), to: formatBaku(b.starts_at) })}
                  </Text>
                )}
                {st.hint && <Text style={styles.hintText}>{st.hint}</Text>}
                <PressableScale style={styles.upcomingBody} onPress={() => router.push(`/salon/${b.business_id}`)}>
                  <View style={[styles.thumb, { backgroundColor: tintFor(b.business_id)[0] }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.salonName}>{b.businesses?.name}</Text>
                    <Text style={styles.subText}>{b.service_name}</Text>
                  </View>
                  <Text style={styles.priceText}>{b.price} ₼</Text>
                </PressableScale>
                {b.status === 'proposed' ? (
                  <View style={styles.upcomingActions}>
                    <PressableScale style={styles.outlineButton} onPress={() => confirmDecline(b)} disabled={busy}>
                      <Text style={styles.outlineButtonText}>{t('client_tabs_bookings.6')}</Text>
                    </PressableScale>
                    <PressableScale style={styles.primaryButton} onPress={() => respond(b, true)} disabled={busy}>
                      {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.darkButtonText}>{t('client_tabs_bookings.16')}</Text>}
                    </PressableScale>
                  </View>
                ) : (
                  <View style={styles.upcomingActions}>
                    <PressableScale style={styles.outlineButton} onPress={() => router.push(`/reschedule/${b.id}`)}>
                      <Text style={styles.outlineButtonText}>{b.status === 'pending' ? t('client_tabs_bookings.17') : t('client_tabs_bookings.18')}</Text>
                    </PressableScale>
                    <PressableScale style={styles.darkButton} onPress={() => router.push(`/salon/${b.business_id}`)}>
                      <Text style={styles.darkButtonText}>{t('client_tabs_bookings.19')}</Text>
                    </PressableScale>
                  </View>
                )}
              </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {past.length === 0 ? (
            <Text style={styles.emptyText}>{t('client_tabs_bookings.20')}</Text>
          ) : (
            past.map((b) => {
              const myReview = myReviewOf(b);
              return (
                <View key={b.id} style={styles.pastCard}>
                  <PressableScale style={styles.pastRow} onPress={() => router.push(`/salon/${b.business_id}`)}>
                    <View style={[styles.pastThumb, { backgroundColor: tintFor(b.business_id)[0] }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.salonName}>{b.businesses?.name}</Text>
                      <Text style={styles.subText}>
                        {b.service_name} · {formatBaku(b.starts_at)}
                      </Text>
                      <Text style={styles.statusMuted}>{statusLabel(b)}</Text>
                    </View>
                  </PressableScale>
                  {b.status === 'completed' &&
                    (myReview ? (
                      <PressableScale style={styles.reviewRow} onPress={() => router.push(`/review/${b.id}`)}>
                        <StarBadge rating={myReview.rating} />
                        <Text style={styles.reviewEditText}>{t('common.41')}</Text>
                      </PressableScale>
                    ) : (
                      <PressableScale style={styles.reviewButton} onPress={() => router.push(`/review/${b.id}`)}>
                        <Text style={styles.reviewButtonText}>{t('common.42')}</Text>
                      </PressableScale>
                    ))}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

// Причина отмены важна клиенту: «мастер не смог» и «салон не ответил» —
// разные ситуации (0029).
const cancelReasonLabel = () => ({
  client: t('client_tabs_bookings.21'),
  business: t('client_tabs_bookings.22'),
  declined: t('client_tabs_bookings.23'),
  expired: t('client_tabs_bookings.24'),
  proposal_declined: t('client_tabs_bookings.25'),
});

function statusLabel(b) {
  switch (b.status) {
    case 'cancelled':
      return cancelReasonLabel()[b.cancel_reason] || t('common.30');
    case 'confirmed':
      return t('client_tabs_bookings.26');
    case 'completed':
      return t('client_tabs_bookings.27');
    case 'no_show':
      return t('common.29');
    default:
      return b.status;
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
  proposalText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.ink, lineHeight: 19, paddingHorizontal: 16, paddingTop: 14 },
  hintText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub, paddingHorizontal: 16, paddingTop: 10 },
  primaryButton: { flex: 1, height: 44, borderRadius: 14, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  upcomingActions: { flexDirection: 'row', gap: SPACING.sm, padding: 16, paddingTop: 0 },
  outlineButton: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center' },
  outlineButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  darkButton: { flex: 1, height: 44, borderRadius: 14, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  darkButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
  pastCard: { borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.md, overflow: 'hidden' },
  pastRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center', padding: SPACING.sm },
  pastThumb: { width: 54, height: 54, borderRadius: 17, opacity: 0.75 },
  reviewButton: { margin: SPACING.sm, marginTop: 0, height: 40, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center' },
  reviewButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, margin: SPACING.sm, marginTop: 0, padding: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: 12 },
  reviewEditText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
});
