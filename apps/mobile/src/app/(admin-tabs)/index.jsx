// Все салоны-партнёры: подписка, владелец, ближайшие записи. Тап — карточка
// салона (продлить подписку, заблокировать, сбросить пароль владельцу).
import { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Search } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { listAllBusinessesAdmin, subscriptionBadge } from '@/utils/supabase/admin';
import { friendlyError } from '@/utils/errors';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { t } from '@/utils/i18n';

const TONE = {
  ok: { bg: '#E8F7EE', fg: COLORS.success },
  warn: { bg: '#FFF4E0', fg: COLORS.warning },
  off: { bg: '#FDECEA', fg: COLORS.danger },
};

export default function AdminBusinesses() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    listAllBusinessesAdmin()
      .then(setItems)
      .catch((e) => setError(friendlyError(e, t('admin_tabs_index.1'))))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  const q = query.trim().toLowerCase();
  const shown = q
    ? items.filter((b) => [b.name, b.owner_name, b.owner_email, b.district].some((v) => v?.toLowerCase().includes(q)))
    : items;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('common.13')}</Text>
      <View style={styles.search}>
        <Search size={17} color={COLORS.sub} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('admin_tabs_index.2')}
          placeholderTextColor={COLORS.sub}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={COLORS.indigo} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ gap: SPACING.sm, paddingBottom: SPACING.xxl }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.indigo} />}
          ListEmptyComponent={<Text style={styles.empty}>{t('admin_tabs_index.3')}</Text>}
          renderItem={({ item: b }) => {
            const badge = subscriptionBadge(b);
            return (
              <PressableScale style={styles.row} onPress={() => router.push(`/admin-business/${b.id}`)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{b.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {b.owner_name || t('common.11')} · {b.owner_email || '—'}
                  </Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: TONE[badge.tone].bg }]}>
                      <Text style={[styles.badgeText, { color: TONE[badge.tone].fg }]}>{badge.label}</Text>
                    </View>
                    {/* Салон ещё не прошёл чек-лист настройки и скрыт из каталога (0024). */}
                    {!b.published_at && (
                      <View style={[styles.badge, { backgroundColor: COLORS.indigo50 }]}>
                        <Text style={[styles.badgeText, { color: COLORS.indigo }]}>{t('admin_tabs_index.4')}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.count}>{b.upcoming_bookings}</Text>
                  <Text style={styles.countLabel}>{t('admin_tabs_index.5')}</Text>
                </View>
              </PressableScale>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white, paddingHorizontal: SPACING.xl, paddingTop: 56 },
  title: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xxl, color: COLORS.ink, letterSpacing: -0.6, marginBottom: SPACING.lg },
  search: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, height: 48, paddingHorizontal: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, marginBottom: SPACING.lg },
  searchInput: { flex: 1, fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger },
  empty: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: SPACING.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md },
  name: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.ink },
  meta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.sm },
  badge: { alignSelf: 'flex-start', borderRadius: RADIUS.pill, paddingVertical: 4, paddingHorizontal: 10 },
  badgeText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.xs },
  count: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.lg, color: COLORS.ink },
  countLabel: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub },
});
