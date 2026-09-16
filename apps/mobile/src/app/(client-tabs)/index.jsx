// Главная — категории и салоны теперь из Supabase (seed: scripts/seed.js).
// "Свободно сегодня" из дизайна убран — показывать реальные слоты можно
// только после getAvailability (RPC для генерации слотов ещё не написан,
// shared/slots.js существует, но не подключён к Postgres).
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { Search } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { iconFor } from '@/data/categoryIcons';
import { tintFor } from '@/utils/tint';
import { listCategories, listBusinesses } from '@/utils/supabase/catalog';

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cats, biz] = await Promise.all([listCategories(), listBusinesses()]);
      setCategories(cats);
      setBusinesses(biz);
    } catch (e) {
      setError(e.message || 'Не удалось загрузить каталог');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: SPACING.xxl }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={COLORS.indigo} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.location}>Баку</Text>
          <Text style={styles.title}>Салоны рядом{'\n'}с вами</Text>
        </View>
        <View style={styles.avatarPlaceholder} />
      </View>

      <Pressable style={styles.searchBar} onPress={() => router.push('/(client-tabs)/search')}>
        <Search size={18} color={COLORS.sub} />
        <Text style={styles.searchPlaceholder}>Услуга, салон или мастер</Text>
      </Pressable>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {loading && categories.length === 0 ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={COLORS.indigo} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {categories.map((c) => {
              const Icon = iconFor(c.id);
              return (
                <Pressable
                  key={c.id}
                  style={styles.catItem}
                  onPress={() => router.push({ pathname: '/(client-tabs)/search', params: { categoryId: c.id, title: c.name_ru } })}
                >
                  <View style={styles.catIcon}>
                    <Icon size={24} color={COLORS.indigo} strokeWidth={1.6} />
                  </View>
                  <Text style={styles.catName}>{c.name_ru}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Салоны</Text>
            <Pressable onPress={() => router.push({ pathname: '/(client-tabs)/search', params: { title: 'Все салоны' } })}>
              <Text style={styles.sectionLink}>Все</Text>
            </Pressable>
          </View>

          {businesses.length === 0 ? (
            <Text style={styles.emptyText}>Салонов пока нет — самое время «Стать партнёром».</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandRow}>
              {businesses.map((b, i) => (
                <Animated.View key={b.id} entering={FadeIn.duration(220).delay(i * 30)}>
                  <Pressable
                    style={({ pressed }) => [styles.brandCard, pressed && styles.cardPressed]}
                    onPress={() => router.push(`/salon/${b.id}`)}
                  >
                    <View style={[styles.brandPhoto, { backgroundColor: tintFor(b.id)[0] }]}>
                      <Text style={styles.photoLabel}>ФОТО</Text>
                    </View>
                    <Text style={styles.brandName}>{b.name}</Text>
                    <Text style={styles.brandMeta}>
                      {b.city}
                      {b.district ? ` · ${b.district}` : ''}
                    </Text>
                  </Pressable>
                </Animated.View>
              ))}
            </ScrollView>
          )}
        </>
      )}
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
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, marginTop: SPACING.md, marginHorizontal: SPACING.xl },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginHorizontal: SPACING.xl },
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
  brandRow: { gap: SPACING.md, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  brandCard: { width: 238 },
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  brandPhoto: { height: 150, borderRadius: RADIUS.lg, overflow: 'hidden' },
  photoLabel: { position: 'absolute', right: 12, bottom: 10, fontFamily: FONT.semibold, fontSize: 10, color: 'rgba(11,17,32,.32)', letterSpacing: 1 },
  brandName: { fontFamily: FONT.bold, fontSize: 15, color: COLORS.ink, marginTop: 11, letterSpacing: -0.2 },
  brandMeta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
});
