// Профиль — по макету «Salon Booking App» (экран isProfile), общий для
// клиентского и бизнес-режима. Отличия от макета — только там, где у
// макета демо-данные или несуществующие функции:
//   • статистика — настоящая (визиты, избранное, отзывы), а не «4.9»;
//   • тёмная карточка «Salonn Plus» (такой подписки нет) — переключатель
//     Клиент ⇄ Бизнес/Админ; обычному клиенту — «Стать партнёром»;
//   • «Способ оплаты» — информационная строка «На месте», без перехода.
// Удаление аккаунта остаётся — его требует App Store (5.1.1(v)).
import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { router, useFocusEffect, useSegments } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Notifications from 'expo-notifications';
import {
  ChevronRight,
  Trash2,
  CreditCard,
  Heart,
  MessageSquare,
  Bell,
  Globe,
  CircleQuestionMark,
  Star,
  Scissors,
  Settings,
  UserRound,
} from 'lucide-react-native';
import { supabase } from '@/utils/supabase/config';
import { deleteMyAccount, getMyContact, saveMyLang } from '@/utils/supabase/profile';
import { getMyStats } from '@/utils/supabase/booking';
import { formatPhone } from '@/utils/phone';
import { useAuthStore } from '@/utils/auth/store';
import { setCachedMode } from '@/utils/auth/roleCache';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/utils/legal';
import PressableScale from '@/components/PressableScale';
import SignInPrompt from '@/components/SignInPrompt';
import LanguagePicker from '@/components/LanguagePicker';
import { t, LANGUAGES, useLang, setLang } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '') || '·';
}

export default function ProfileScreen() {
  const { uid, role, businessId, mode, setMode } = useAuthStore();
  const lang = useLang((s) => s.lang);
  const segments = useSegments();
  const [contact, setContact] = useState(null);
  const [stats, setStats] = useState(null);
  const [notifOn, setNotifOn] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isBusinessSide = role === 'business_owner' || role === 'staff';
  // Второй режим, кроме клиентского: админка или бизнес-режим.
  const workMode = role === 'admin' ? 'admin' : isBusinessSide ? 'business' : null;

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      getMyContact(uid).then(setContact).catch(() => {});
      getMyStats(uid).then(setStats).catch(() => {});
      Notifications.getPermissionsAsync()
        .then((p) => setNotifOn(p.granted))
        .catch(() => setNotifOn(null));
    }, [uid])
  );

  async function switchMode() {
    const next = mode === 'client' ? workMode : 'client';
    await setCachedMode(uid, next);
    setMode(next);
    // Не router.replace('/') — группы (client-tabs)/(business-tabs) не входят
    // в URL, replace('/') оказался бы no-op. Переключаем на группу напрямую.
    router.replace(next === 'admin' ? '/(admin-tabs)' : next === 'business' ? '/(business-tabs)' : '/(client-tabs)');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  const openPrivacyPolicy = () => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL);
  const openTerms = () => WebBrowser.openBrowserAsync(TERMS_URL);

  // Три языка — ровно три кнопки, больше Android в Alert не показывает;
  // закрыть можно тапом мимо.
  function chooseLanguage() {
    Alert.alert(
      t('lang.title'),
      undefined,
      LANGUAGES.map((l) => ({
        text: l.label,
        onPress: () => setLang(l.code, (c) => saveMyLang(c).catch(() => {}), `/${segments.join('/')}`),
      })),
      { cancelable: true }
    );
  }

  function openHelp() {
    Alert.alert(
      t('profile.help'),
      undefined,
      [
        { text: t('components_ProfileScreen.12'), onPress: openPrivacyPolicy },
        { text: t('components_ProfileScreen.13'), onPress: openTerms },
        { text: t('common.40'), style: 'cancel' },
      ],
      { cancelable: true }
    );
  }

  // Двухшаговое подтверждение — необратимое действие.
  function handleDeleteAccount() {
    Alert.alert(t('components_ProfileScreen.4'), t('components_ProfileScreen.5'), [
      { text: t('common.23'), style: 'cancel' },
      {
        text: t('common.63'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('components_ProfileScreen.6'), t('components_ProfileScreen.7'), [
            { text: t('common.23'), style: 'cancel' },
            { text: t('components_ProfileScreen.8'), style: 'destructive', onPress: confirmDeleteAccount },
          ]);
        },
      },
    ]);
  }

  async function confirmDeleteAccount() {
    setDeleting(true);
    try {
      await deleteMyAccount();
      router.replace('/(auth)/login');
    } catch (e) {
      Alert.alert(t('components_ProfileScreen.9'), friendlyError(e, t('common.24')));
    } finally {
      setDeleting(false);
    }
  }

  // Гость — приглашение войти, язык и юридические ссылки.
  if (!uid) {
    return (
      <View style={styles.guest}>
        <Text style={styles.title}>{t('common.14')}</Text>
        <SignInPrompt title={t('components_ProfileScreen.10')} subtitle={t('components_ProfileScreen.11')} redirect="/(client-tabs)/profile" />
        <LanguagePicker />
        <View style={styles.legalRow}>
          <Pressable onPress={openPrivacyPolicy}>
            <Text style={styles.legalLink}>{t('components_ProfileScreen.12')}</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={openTerms}>
            <Text style={styles.legalLink}>{t('components_ProfileScreen.13')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Тёмная карточка: переключение режима или «Стать партнёром».
  const switchCard = workMode
    ? mode === 'client'
      ? {
          title: workMode === 'admin' ? t('profile.adminTitle') : t('profile.businessTitle'),
          text: workMode === 'admin' ? t('profile.adminText') : t('profile.businessText'),
          button: t('profile.switchGo'),
          onPress: switchMode,
        }
      : { title: t('profile.clientTitle'), text: t('profile.clientText'), button: t('profile.switchGo'), onPress: switchMode }
    : role === 'client'
      ? { title: t('profile.partnerTitle'), text: t('profile.partnerText'), button: t('profile.more'), onPress: () => router.push('/(client-tabs)/become-partner') }
      : null;

  const clientMode = mode === 'client';
  const langLabel = LANGUAGES.find((l) => l.code === lang)?.label;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.top}>
        <Text style={styles.title}>{t('common.14')}</Text>

        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(contact?.name).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.userName} numberOfLines={1}>
              {contact?.name || roleLabel(role)}
            </Text>
            <Text style={[styles.userPhone, contact && !contact.phone && { color: COLORS.warning }]} numberOfLines={1}>
              {contact ? (contact.phone ? formatPhone(contact.phone) : t('profile.addPhone')) : ' '}
            </Text>
          </View>
          <PressableScale style={styles.editButton} onPress={() => router.push('/edit-profile')}>
            <Text style={styles.editText}>{t('profile.edit')}</Text>
          </PressableScale>
        </View>

        {clientMode && (
          <View style={styles.statsRow}>
            {[
              { v: stats?.visits, k: t('profile.statVisits') },
              { v: stats?.favorites, k: t('profile.statFavorites') },
              { v: stats?.reviews, k: t('profile.statReviews') },
            ].map((s) => (
              <View key={s.k} style={styles.stat}>
                <Text style={styles.statValue}>{s.v ?? '—'}</Text>
                <Text style={styles.statLabel}>{s.k}</Text>
              </View>
            ))}
          </View>
        )}

        {switchCard && (
          <View style={styles.darkCard}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.darkTitle}>{switchCard.title}</Text>
              <Text style={styles.darkText}>{switchCard.text}</Text>
            </View>
            <PressableScale style={styles.darkButton} onPress={switchCard.onPress}>
              <Text style={styles.darkButtonText}>{switchCard.button}</Text>
            </PressableScale>
          </View>
        )}
      </View>

      <View style={styles.groups}>
        {clientMode ? (
          <Group title={t('profile.groupAccount')}>
            <Row Icon={CreditCard} label={t('profile.payment')} hint={t('profile.paymentOnSite')} />
            <Row Icon={Heart} label={t('common.43')} hint={stats ? String(stats.favorites) : ''} onPress={() => router.push('/(client-tabs)/favorites')} />
            <Row Icon={MessageSquare} label={t('profile.myReviews')} hint={stats ? String(stats.reviews) : ''} onPress={() => router.push('/my-reviews')} last />
          </Group>
        ) : (
          isBusinessSide &&
          businessId && (
            <Group title={t('profile.groupBusiness')}>
              <Row Icon={Star} label={t('common.73')} onPress={() => router.push(`/business-reviews/${businessId}`)} />
              {role === 'staff' && <Row Icon={UserRound} label={t('components_ProfileScreen.14')} onPress={() => router.push('/my-master-profile')} last />}
              {role === 'business_owner' && (
                <>
                  <Row Icon={Scissors} label={t('common.48')} onPress={() => router.push(`/services/${businessId}`)} />
                  <Row Icon={Settings} label={t('common.66')} onPress={() => router.push(`/business-settings/${businessId}`)} last />
                </>
              )}
            </Group>
          )
        )}

        <Group title={t('profile.groupSettings')}>
          <Row
            Icon={Bell}
            label={t('profile.notifications')}
            hint={notifOn === null ? '' : notifOn ? t('profile.on') : t('profile.off')}
            onPress={() => Linking.openSettings().catch(() => {})}
          />
          <Row Icon={Globe} label={t('lang.title')} hint={langLabel} onPress={chooseLanguage} />
          <Row Icon={CircleQuestionMark} label={t('profile.help')} onPress={openHelp} last />
        </Group>

        <PressableScale style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>{t('common.15')}</Text>
        </PressableScale>

        <PressableScale style={styles.deleteRow} onPress={handleDeleteAccount} disabled={deleting}>
          {deleting ? (
            <ActivityIndicator color={COLORS.danger} />
          ) : (
            <>
              <Trash2 size={15} color="#B6BCC8" />
              <Text style={styles.deleteText}>{t('components_ProfileScreen.15')}</Text>
            </>
          )}
        </PressableScale>

        <Text style={styles.version}>{t('components_ProfileScreen.16')}</Text>
      </View>
    </ScrollView>
  );
}

function Group({ title, children }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupBox}>{children}</View>
    </View>
  );
}

// Строка меню из макета: иконка, название, подсказка справа, шеврон.
// Без onPress — информационная строка (без шеврона и нажатия).
function Row({ Icon, label, hint, onPress, last }) {
  const content = (
    <>
      <Icon size={19} color={COLORS.indigo} strokeWidth={1.7} />
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      {onPress && <ChevronRight size={15} color="#C3C8D4" />}
    </>
  );
  return onPress ? (
    <PressableScale style={[styles.row, last && styles.rowLast]} onPress={onPress}>
      {content}
    </PressableScale>
  ) : (
    <View style={[styles.row, last && styles.rowLast]}>{content}</View>
  );
}

function roleLabel(role) {
  switch (role) {
    case 'business_owner':
      return t('components_ProfileScreen.17');
    case 'staff':
      return t('common.21');
    case 'admin':
      return t('components_ProfileScreen.18');
    default:
      return t('common.32');
  }
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingBottom: 30, backgroundColor: COLORS.white },
  guest: { flex: 1, padding: SPACING.xl, paddingTop: 56, backgroundColor: COLORS.white },
  top: { paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: 4 },
  title: { fontFamily: FONT.extrabold, fontSize: 26, color: COLORS.ink, letterSpacing: -0.8, lineHeight: 32 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20 },
  avatar: { width: 72, height: 72, borderRadius: 26, backgroundColor: '#DCE1F0', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: FONT.extrabold, fontSize: 24, color: '#5B6478', letterSpacing: -0.5 },
  userName: { fontFamily: FONT.bold, fontSize: 18, color: COLORS.ink, letterSpacing: -0.4 },
  userPhone: { fontFamily: FONT.medium, fontSize: 13, color: COLORS.sub, marginTop: 3 },
  editButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center' },
  editText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  stat: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 20, backgroundColor: COLORS.surfaceAlt },
  statValue: { fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, letterSpacing: -0.4 },
  statLabel: { fontFamily: FONT.medium, fontSize: 11.5, color: COLORS.sub, marginTop: 6 },
  darkCard: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 22, padding: SPACING.lg, borderRadius: 22, backgroundColor: COLORS.ink },
  darkTitle: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.white },
  darkText: { fontFamily: FONT.medium, fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 4, lineHeight: 17 },
  darkButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 13, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  darkButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
  groups: { paddingTop: 22, paddingHorizontal: SPACING.xl },
  group: { marginBottom: 22 },
  groupTitle: { fontFamily: FONT.semibold, fontSize: 11, color: COLORS.sub, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 10 },
  groupBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 15, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.white },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { flex: 1, fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  rowHint: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  signOutButton: { height: 50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(11,17,32,.1)', alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.danger },
  // Приглушённее «Выйти» — не частое действие, случайный тап не должен быть лёгким.
  deleteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, height: 44, marginTop: SPACING.sm },
  deleteText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: '#B6BCC8' },
  version: { textAlign: 'center', fontFamily: FONT.medium, fontSize: 11.5, color: '#B6BCC8', marginTop: 14 },
  legalRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xl },
  legalLink: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub, textDecorationLine: 'underline' },
  legalDot: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.subLight },
});
