// Сегодня — реальный дашборд бизнеса. Баннер "заявки ждут ответа" и кнопка
// "Закрыть слот" из дизайна убраны: в нашей системе брони создаются сразу
// confirmed (нет статуса pending, платежей нет — не за что "подтверждать"
// вручную), а точечное закрытие слота — отдельная задача под
// master_exceptions/custom_hours, ещё не построена.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/utils/auth/store';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { getMyBusiness, listBusinessBookings, getSetupStatus, listBookingRequests } from '@/utils/supabase/business';
import { daysLeft, formatDateRu } from '@/utils/supabase/admin';
import { PARTNER_WHATSAPP, hasPartnerWhatsapp, whatsappUrl } from '@/utils/contact';
import { bakuToday } from '@/components/DateTimeGrid';
import PressableScale from '@/components/PressableScale';
import { dowFull, dayMonth } from '@/utils/i18n/dates';
import { t, tn } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';


function formatTime(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() + 4 * 3600000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function localDateOf(isoUtc) {
  return new Date(new Date(isoUtc).getTime() + 4 * 3600000).toISOString().slice(0, 10);
}
function formatDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${dowFull(d.getUTCDay())}, ${dayMonth(d.getUTCDate(), d.getUTCMonth())}`;
}

export default function BusinessToday() {
  const businessId = useAuthStore((s) => s.businessId);
  const isOwner = useAuthStore((s) => s.role === 'business_owner');
  const [business, setBusiness] = useState(null);
  const [todayBookings, setTodayBookings] = useState([]);
  const [nextDay, setNextDay] = useState(null); // { date, bookings } — ближайший день с записями, если сегодня пусто
  const [setupDone, setSetupDone] = useState(null); // сколько пунктов чек-листа готово, пока салон не опубликован
  const [requests, setRequests] = useState([]); // заявки клиентов, ждущие ответа (0029)
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
      Promise.all([
        getMyBusiness(businessId),
        listBusinessBookings({ businessId, from: today, days: 30 }),
        listBookingRequests(businessId),
      ])
        .then(([b, bk, reqs]) => {
          if (cancelled) return;
          setBusiness(b);
          setRequests(reqs);
          // Новый салон ещё не опубликован (0024): владельцу при первом
          // заходе за сессию сразу открываем чек-лист, дальше — баннер.
          if (!b.published_at && isOwner) {
            getSetupStatus(businessId)
              .then((s) => {
                if (cancelled) return;
                setSetupDone(['description', 'location', 'photos', 'masters', 'schedule', 'services'].filter((k) => s[k]).length);
              })
              .catch(() => {});
            const { setupPromptShownFor, setAuth } = useAuthStore.getState();
            if (setupPromptShownFor !== businessId) {
              setAuth({ setupPromptShownFor: businessId });
              router.push(`/salon-setup/${businessId}`);
            }
          }
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
        .catch((e) => !cancelled && setError(friendlyError(e, t('common.20'))))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [businessId, isOwner])
  );

  const todayDate = new Date(Date.now() + 4 * 3600000);
  const dateLabel = `${dowFull(todayDate.getUTCDay())}, ${dayMonth(todayDate.getUTCDate(), todayDate.getUTCMonth())}`;
  const revenue = todayBookings.reduce((sum, b) => sum + Number(b.price), 0);
  const showingNextDay = todayBookings.length === 0 && !!nextDay;
  const bookings = showingNextDay ? nextDay.bookings : todayBookings;

  // Подписка заканчивается через ≤ 5 дней или уже закончилась — салон
  // пропадёт (или уже пропал) из каталога, владельцу нужно продлить.
  const left = daysLeft(business?.paid_until);
  const subscription =
    left === null || left > 5
      ? null
      : left < 0
        ? { expired: true, title: t('business_tabs_index.1', { p0: formatDateRu(business.paid_until) }) }
        : { expired: false, title: t('business_tabs_index.2', { p0: formatDateRu(business.paid_until), left }) };

  async function openPartnerWhatsapp() {
    if (!hasPartnerWhatsapp()) return;
    Linking.openURL(whatsappUrl(t('business_tabs_index.3', { p0: business?.name }), PARTNER_WHATSAPP)).catch(() => {});
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
          <Text style={styles.kpiLabel}>{t('business_tabs_index.4')}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{revenue} ₼</Text>
          <Text style={styles.kpiLabel}>{t('business_tabs_index.5')}</Text>
        </View>
        {/* Рейтинг — вход в отзывы (0035: о новых приходит push). */}
        <PressableScale style={styles.kpiCard} onPress={() => router.push(`/business-reviews/${businessId}`)}>
          <Text style={styles.kpiValue}>{business?.review_count ? `★ ${Number(business.rating_avg).toFixed(1)}` : '—'}</Text>
          <Text style={styles.kpiLabel}>{tn('plural.reviews', business?.review_count || 0)}</Text>
        </PressableScale>
      </View>

      {business && !business.published_at && (
        isOwner ? (
          <PressableScale style={styles.setupBanner} onPress={() => router.push(`/salon-setup/${businessId}`)}>
            <Text style={styles.setupTitle}>{t('business_tabs_index.6')}</Text>
            <Text style={styles.setupText}>{t('business_tabs_index.7')}{setupDone !== null ? ` (${setupDone}/6)` : ''}{' '}{t('business_tabs_index.8')}</Text>
          </PressableScale>
        ) : (
          <View style={styles.setupBanner}>
            <Text style={styles.setupTitle}>{t('business_tabs_index.9')}</Text>
            <Text style={styles.setupText}>{t('business_tabs_index.10')}</Text>
          </View>
        )
      )}

      {isOwner && subscription && (
        <PressableScale style={[styles.subBanner, subscription.expired && styles.subBannerOff]} onPress={openPartnerWhatsapp}>
          <Text style={[styles.subTitle, subscription.expired && { color: COLORS.danger }]}>{subscription.title}</Text>
          <Text style={styles.subText}>{t('business_tabs_index.11')}</Text>
        </PressableScale>
      )}

      {/* Ручную запись к любому мастеру делает владелец; мастер видит
          только своё расписание (0022). */}
      {isOwner && (
        <PressableScale style={styles.quickButton} onPress={() => router.push(`/manual-booking/${businessId}`)}>
          <Text style={styles.quickButtonText}>{t('business_tabs_index.12')}</Text>
        </PressableScale>
      )}

      {/* Заявки клиентов (0029): сверху, потому что у них срок ответа — 2 часа. */}
      {requests.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('business_tabs_index.13')}{' '}{requests.length}</Text>
          </View>
          {requests.map((r) => {
            const pending = r.status === 'pending';
            return (
              <PressableScale key={r.id} style={[styles.requestCard, pending && styles.requestCardPending]} onPress={() => router.push(`/booking-request/${r.id}`)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.agendaClient}>{r.client_name || t('common.32')}</Text>
                  <Text style={styles.agendaService}>
                    {r.service_name} · {formatDateLabel(localDateOf(r.starts_at))}, {formatTime(r.starts_at)}
                  </Text>
                  <Text style={[styles.requestHint, pending && { color: COLORS.warning }]}>
                    {pending
                      ? t('business_tabs_index.14', { p0: formatTime(r.expires_at), p1: r.masters?.name ? ` · ${r.masters.name}` : '' })
                      : t('business_tabs_index.15')}
                  </Text>
                </View>
                <Text style={[styles.requestAction, !pending && { color: COLORS.sub }]}>{pending ? t('business_tabs_index.16') : t('business_tabs_index.17')}</Text>
              </PressableScale>
            );
          })}
        </>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {showingNextDay ? t('business_tabs_index.18', { p0: formatDateLabel(nextDay.date) }) : t('business_tabs_index.19')}
        </Text>
        <PressableScale onPress={() => router.push('/(business-tabs)/calendar')}>
          <Text style={styles.sectionLink}>{t('common.33')}</Text>
        </PressableScale>
      </View>

      {bookings.length === 0 ? (
        <Text style={styles.emptyText}>{t('business_tabs_index.20')}</Text>
      ) : (
        bookings.map((b) => (
          <View key={b.id} style={styles.agendaRow}>
            <Text style={styles.agendaTime}>{formatTime(b.starts_at)}</Text>
            <PressableScale style={styles.agendaCard} onPress={() => router.push(`/booking-request/${b.id}`)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.agendaClient}>{b.client_name || t('common.22')}</Text>
                <Text style={styles.agendaService}>{b.service_name}</Text>
              </View>
              <Text style={styles.agendaPrice}>{b.price} ₼</Text>
            </PressableScale>
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
  subBanner: { marginTop: SPACING.md, marginHorizontal: SPACING.xl, padding: 14, borderRadius: RADIUS.md, backgroundColor: '#FFF4E0' },
  subBannerOff: { backgroundColor: '#FDECEA' },
  setupBanner: { marginTop: SPACING.md, marginHorizontal: SPACING.xl, padding: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo50 },
  setupTitle: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.indigo },
  setupText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub, marginTop: 4 },
  subTitle: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.warning },
  subText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub, marginTop: 4 },
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
  requestCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginHorizontal: SPACING.xl, marginBottom: SPACING.sm, padding: 14, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo100 },
  requestCardPending: { backgroundColor: '#FFF4E0' },
  requestHint: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.xs, color: COLORS.sub, marginTop: 4 },
  requestAction: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.indigo },
  agendaPrice: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
});
