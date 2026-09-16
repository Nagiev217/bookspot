// Избранное — реальный список, сохранённый через favorites (0009_favorites.sql).
// Карточка — тот же стиль, что и в search.jsx (переиспользовать компонент
// пока не стоит: два места, разница только в источнике данных).
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import { useAuthStore } from '@/utils/auth/store';
import { listFavoriteBusinesses } from '@/utils/supabase/favorites';

export default function Favorites() {
  const uid = useAuthStore((s) => s.uid);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!uid) {
        setLoading(false);
        return;
      }
      let cancelled = false;
      setLoading(true);
      setError(null);
      listFavoriteBusinesses(uid)
        .then((data) => !cancelled && setBusinesses(data))
        .catch((e) => !cancelled && setError(e.message || 'Не удалось загрузить избранное'))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [uid])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Избранное</Text>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {businesses.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.icon} />
          <Text style={styles.emptyTitle}>Пока пусто</Text>
          <Text style={styles.emptySubtitle}>Нажмите на сердечко на странице салона, чтобы добавить его сюда.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {businesses.map((b) => (
            <Pressable key={b.id} style={styles.card} onPress={() => router.push(`/salon/${b.id}`)}>
              <View style={[styles.photo, { backgroundColor: tintFor(b.id)[0] }]}>
                <Text style={styles.photoLabel}>ФОТО</Text>
              </View>
              <Text style={styles.cardName}>{b.name}</Text>
              <Text style={styles.cardMeta}>
                {b.city}
                {b.district ? ` · ${b.district}` : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  title: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xxl, color: COLORS.ink, letterSpacing: -0.6, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, paddingHorizontal: SPACING.xl },
  icon: { width: 62, height: 62, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface },
  emptyTitle: { fontFamily: FONT.bold, fontSize: 17, color: COLORS.ink, marginTop: SPACING.lg },
  emptySubtitle: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 7, maxWidth: 230, textAlign: 'center', lineHeight: 19 },
  list: { padding: SPACING.xl, gap: SPACING.md },
  card: {},
  photo: { height: 150, borderRadius: RADIUS.xl, overflow: 'hidden' },
  photoLabel: { position: 'absolute', right: 12, bottom: 10, fontFamily: FONT.semibold, fontSize: 10, color: 'rgba(11,17,32,.3)', letterSpacing: 1 },
  cardName: { fontFamily: FONT.bold, fontSize: 15.5, color: COLORS.ink, letterSpacing: -0.2, marginTop: 11 },
  cardMeta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
});
