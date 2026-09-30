// Общий экран профиля для Client и Business режимов — избегаем двух копий
// одной и той же логики (переключатель режима, выход, язык). Визуальный
// стиль перенесён из дизайн-canvas "Salon Booking App"; в отличие от
// дизайна (там статичное демо-имя "Лейла Мамедова" и выдуманная
// статистика) здесь показаны только реальные данные аккаунта — без
// придуманных цифр.
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { LogOut, ChevronRight, Trash2 } from 'lucide-react-native';
import { supabase } from '@/utils/supabase/config';
import { deleteMyAccount } from '@/utils/supabase/profile';
import { useAuthStore } from '@/utils/auth/store';
import { setCachedMode } from '@/utils/auth/roleCache';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/utils/legal';
import PressableScale from '@/components/PressableScale';
import SignInPrompt from '@/components/SignInPrompt';

export default function ProfileScreen() {
  const { uid, role, businessId, mode, setMode } = useAuthStore();
  const isBusinessSide = role === 'business_owner' || role === 'staff';
  // Второй режим, кроме клиентского: админка или бизнес-режим.
  const workMode = role === 'admin' ? 'admin' : isBusinessSide ? 'business' : null;
  const [deleting, setDeleting] = useState(false);

  async function switchMode() {
    const next = mode === 'client' ? workMode : 'client';
    await setCachedMode(uid, next);
    setMode(next);
    // Не router.replace('/') — у (client-tabs)/index и (business-tabs)/index
    // группы не входят в URL, поэтому их путь тоже резолвится в "/". Если
    // мы уже "на /", replace('/') становится no-op и гейт в index.jsx
    // не перерендеривается. Переключаем на конкретную группу напрямую.
    router.replace(next === 'admin' ? '/(admin-tabs)' : next === 'business' ? '/(business-tabs)' : '/(client-tabs)');
  }

  const switchLabel =
    mode !== 'client' ? 'Переключиться в Client mode' : workMode === 'admin' ? 'Перейти в админку' : 'Переключиться в Business mode';

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  function openPrivacyPolicy() {
    WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL);
  }

  function openTerms() {
    WebBrowser.openBrowserAsync(TERMS_URL);
  }

  // Двухшаговое подтверждение — необратимое действие. Владелец активного
  // бизнеса получит здесь же ошибку от RPC (delete_my_account сама это
  // проверяет на сервере) с понятным текстом, почему нельзя.
  function handleDeleteAccount() {
    Alert.alert(
      'Удалить аккаунт?',
      'Это необратимо. Личные данные будут удалены; история визитов останется у салонов, но без вашего имени и телефона.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Вы уверены?', 'Аккаунт нельзя будет восстановить.', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Удалить навсегда', style: 'destructive', onPress: confirmDeleteAccount },
            ]);
          },
        },
      ]
    );
  }

  async function confirmDeleteAccount() {
    setDeleting(true);
    try {
      await deleteMyAccount();
      router.replace('/(auth)/login');
    } catch (e) {
      Alert.alert('Не удалось удалить аккаунт', e.message || 'Попробуйте ещё раз');
    } finally {
      setDeleting(false);
    }
  }

  // Гость (каталог доступен без входа, см. index.jsx) — весь остальной
  // экран завязан на аккаунт (роль, режим, удаление аккаунта), поэтому для
  // гостя это просто приглашение войти, а не урезанная версия того же UI.
  if (!uid) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Профиль</Text>
        <SignInPrompt
          title="Вы не вошли в аккаунт"
          subtitle="Войдите, чтобы записываться, сохранять избранное и управлять своим бизнесом."
          redirect="/(client-tabs)/profile"
        />
        <View style={styles.legalRow}>
          <Pressable onPress={openPrivacyPolicy}>
            <Text style={styles.legalLink}>Политика конфиденциальности</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={openTerms}>
            <Text style={styles.legalLink}>Условия использования</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Профиль</Text>

      <View style={styles.card}>
        <View style={styles.avatar} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.role}>{roleLabel(role)}</Text>
        </View>
      </View>

      <View style={styles.group}>
        {workMode && <MenuRow label={switchLabel} onPress={switchMode} last={role !== 'business_owner'} />}
        {role === 'business_owner' && (
          <>
            <MenuRow label="Услуги" onPress={() => router.push(`/services/${businessId}`)} />
            <MenuRow label="Настройки бизнеса" onPress={() => router.push(`/business-settings/${businessId}`)} last />
          </>
        )}
        {role === 'client' && (
          <MenuRow label="Стать партнёром" onPress={() => router.push('/(client-tabs)/become-partner')} last />
        )}
      </View>

      <View style={styles.group}>
        <MenuRow label="Политика конфиденциальности" onPress={openPrivacyPolicy} />
        <MenuRow label="Условия использования" onPress={openTerms} last />
      </View>

      <PressableScale style={styles.signOutButton} onPress={handleSignOut}>
        <LogOut size={18} color={COLORS.danger} />
        <Text style={styles.signOutText}>Выйти</Text>
      </PressableScale>

      <PressableScale style={styles.deleteRow} onPress={handleDeleteAccount} disabled={deleting}>
        {deleting ? (
          <ActivityIndicator color={COLORS.danger} />
        ) : (
          <>
            <Trash2 size={16} color="#B6BCC8" />
            <Text style={styles.deleteText}>Удалить аккаунт</Text>
          </>
        )}
      </PressableScale>

      <Text style={styles.version}>Версия 1.0 · Баку</Text>
    </ScrollView>
  );
}

function MenuRow({ label, onPress, last }) {
  return (
    <PressableScale style={[styles.menuRow, last && styles.menuRowLast]} onPress={onPress}>
      <Text style={styles.menuLabel}>{label}</Text>
      <ChevronRight size={15} color="#C3C8D4" />
    </PressableScale>
  );
}

function roleLabel(role) {
  switch (role) {
    case 'business_owner':
      return 'Владелец бизнеса';
    case 'staff':
      return 'Мастер';
    case 'admin':
      return 'Администратор';
    default:
      return 'Клиент';
  }
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: SPACING.xl, paddingTop: 56, backgroundColor: COLORS.white },
  title: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xxl, color: COLORS.ink, letterSpacing: -0.6, marginBottom: SPACING.lg },
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.xxl },
  avatar: { width: 60, height: 60, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface },
  role: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.lg, color: COLORS.ink },
  group: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: SPACING.xl },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuLabel: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  legalRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xl },
  legalLink: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub, textDecorationLine: 'underline' },
  legalDot: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.subLight },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    height: 50,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(11,17,32,.1)',
  },
  signOutText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.danger },
  // Визуально приглушённее, чем "Выйти" — не первичное и не частое
  // действие, случайный тап не должен быть таким же лёгким, как выход.
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    height: 44,
    marginTop: SPACING.sm,
  },
  deleteText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: '#B6BCC8' },
  version: { textAlign: 'center', fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: '#B6BCC8', marginTop: SPACING.md },
});
