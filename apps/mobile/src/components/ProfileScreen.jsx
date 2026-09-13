// Общий экран профиля для Client и Business режимов — избегаем двух копий
// одной и той же логики (переключатель режима, выход, язык). Визуальный
// стиль перенесён из дизайн-canvas "Salon Booking App"; в отличие от
// дизайна (там статичное демо-имя "Лейла Мамедова" и выдуманная
// статистика) здесь показаны только реальные данные аккаунта — без
// придуманных цифр.
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { LogOut, ChevronRight } from 'lucide-react-native';
import { supabase } from '@/utils/supabase/config';
import { useAuthStore } from '@/utils/auth/store';
import { setCachedMode } from '@/utils/auth/roleCache';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

export default function ProfileScreen() {
  const { uid, role, mode, setMode } = useAuthStore();
  const isStaff = role === 'business_owner' || role === 'staff';

  async function switchMode() {
    const next = mode === 'client' ? 'business' : 'client';
    await setCachedMode(uid, next);
    setMode(next);
    router.replace('/');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
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
        {isStaff && (
          <MenuRow label={mode === 'client' ? 'Переключиться в Business mode' : 'Переключиться в Client mode'} onPress={switchMode} />
        )}
        {role === 'client' && (
          <MenuRow label="Стать партнёром" onPress={() => router.push('/(client-tabs)/become-partner')} last />
        )}
      </View>

      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <LogOut size={18} color={COLORS.danger} />
        <Text style={styles.signOutText}>Выйти</Text>
      </Pressable>
      <Text style={styles.version}>Версия 1.0 · Баку</Text>
    </ScrollView>
  );
}

function MenuRow({ label, onPress, last }) {
  return (
    <Pressable style={[styles.menuRow, last && styles.menuRowLast]} onPress={onPress}>
      <Text style={styles.menuLabel}>{label}</Text>
      <ChevronRight size={15} color="#C3C8D4" />
    </Pressable>
  );
}

function roleLabel(role) {
  switch (role) {
    case 'business_owner':
      return 'Владелец бизнеса';
    case 'staff':
      return 'Сотрудник';
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
  version: { textAlign: 'center', fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: '#B6BCC8', marginTop: SPACING.md },
});
