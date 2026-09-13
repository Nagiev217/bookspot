// Главная — перенесено из дизайн-canvas "Salon Booking App" (Home, вариант A
// "Каталог"; вариант Б "Редакция" не переносим по решению владельца).
// Данные пока демо (src/data/salonMock.js) — связь с Supabase отдельным шагом.
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import StarBadge from '@/components/StarBadge';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { CATEGORIES, SALONS, TODAY_LIST, TINTS } from '@/data/salonMock';

export default function Home() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.location}>Баку, Насими</Text>
          <Text style={styles.title}>Салоны рядом{'\n'}с вами</Text>
        </View>
        <View style={styles.avatarPlaceholder} />
      </View>

      <Pressable style={styles.searchBar} onPress={() => router.push('/(client-tabs)/search')}>
        <Search size={18} color={COLORS.sub} />
        <Text style={styles.searchPlaceholder}>Услуга, салон или мастер</Text>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.id}
            style={styles.catItem}
            onPress={() => router.push({ pathname: '/(client-tabs)/search', params: { title: c.name } })}
          >
            <View style={styles.catIcon}>
              <c.icon size={24} color={COLORS.indigo} strokeWidth={1.6} />
            </View>
            <Text style={styles.catName}>{c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Бренды салонов</Text>
        <Pressable onPress={() => router.push({ pathname: '/(client-tabs)/search', params: { title: 'Все салоны' } })}>
          <Text style={styles.sectionLink}>Все</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandRow}>
        {SALONS.slice(0, 3).map((s, i) => (
          <Pressable key={s.name} style={styles.brandCard} onPress={() => router.push(`/salon/${i}`)}>
            <View style={[styles.brandPhoto, { backgroundColor: TINTS[i % TINTS.length][0] }]}>
              <StarBadge rating={s.rating} style={styles.brandBadge} />
              <Text style={styles.photoLabel}>ФОТО</Text>
            </View>
            <Text style={styles.brandName}>{s.name}</Text>
            <Text style={styles.brandMeta}>{s.meta}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Свободно сегодня</Text>
        <Text style={styles.sectionMuted}>Вс, 13 сентября</Text>
      </View>
      <View style={styles.todayList}>
        {TODAY_LIST.map((t, i) => (
          <Pressable key={t.name} style={styles.todayRow} onPress={() => router.push(`/salon/${i}`)}>
            <View style={[styles.todayThumb, { backgroundColor: TINTS[i % TINTS.length][0] }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.todayName}>{t.name}</Text>
              <Text style={styles.todaySub}>{t.sub}</Text>
              <View style={styles.slotsRow}>
                {t.slots.map((s) => (
                  <Text key={s} style={styles.slotChip}>
                    {s}
                  </Text>
                ))}
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingTop: 56,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  location: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, letterSpacing: 0.2 },
  title: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xxl, color: COLORS.ink, letterSpacing: -0.6, marginTop: 6, lineHeight: 32 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  searchBar: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    height: 50,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
  },
  searchPlaceholder: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub },
  catRow: { gap: SPACING.sm, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg },
  catItem: { width: 74, alignItems: 'center', gap: SPACING.sm },
  catIcon: { width: 62, height: 62, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  catName: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.xs, color: '#3A4256', textAlign: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  sectionTitle: { fontFamily: FONT.bold, fontSize: 17, color: COLORS.ink, letterSpacing: -0.3 },
  sectionLink: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.indigo },
  sectionMuted: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  brandRow: { gap: SPACING.md, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  brandCard: { width: 238 },
  brandPhoto: { height: 150, borderRadius: RADIUS.lg, overflow: 'hidden' },
  brandBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    height: 26,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,.92)',
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoLabel: { position: 'absolute', right: 12, bottom: 10, fontFamily: FONT.semibold, fontSize: 10, color: 'rgba(11,17,32,.32)', letterSpacing: 1 },
  brandName: { fontFamily: FONT.bold, fontSize: 15, color: COLORS.ink, marginTop: 11, letterSpacing: -0.2 },
  brandMeta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  todayList: { paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  todayRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
    padding: SPACING.sm,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
  },
  todayThumb: { width: 58, height: 58, borderRadius: RADIUS.md },
  todayName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  todaySub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  slotsRow: { flexDirection: 'row', gap: 6, marginTop: SPACING.sm },
  slotChip: {
    fontFamily: FONT.bold,
    fontSize: TEXT_SIZE.xs,
    color: COLORS.indigo,
    backgroundColor: COLORS.indigo50,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 9,
    overflow: 'hidden',
  },
});
