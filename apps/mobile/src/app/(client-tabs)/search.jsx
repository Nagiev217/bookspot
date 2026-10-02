// Список салонов — реальные данные из Supabase. Фильтры "Рейтинг/Цена/Км" и
// режим карты из дизайна не реализованы: нет ни отзывов (рейтинга), ни
// geo-координат в схеме бизнеса (Фаза 2 концепта). Нерабочая кнопка "На
// карте" убрана перед релизом — App Store отклоняет видимые заглушки
// (Guideline 2.1). Вернуть вместе с настоящей картой, не раньше.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import PressableScale from '@/components/PressableScale';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { Search as SearchIcon } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import { searchBusinesses } from '@/utils/supabase/catalog';
import { useReducedMotion } from '@/utils/useReducedMotion';
import { t, tn } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';

export default function Search() {
  const { title, categoryId, q: initialQuery } = useLocalSearchParams();
  const [query, setQuery] = useState(initialQuery || '');
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);
  const reducedMotion = useReducedMotion();

  const runSearch = useCallback(
    (signal) => {
      // Спиннер на весь экран — только при самом первом открытии. При
      // повторном фокусе или наборе текста список остаётся на месте, пока
      // грузятся свежие данные — иначе каждое нажатие клавиши и каждое
      // переключение вкладки мигает пустым экраном.
      if (!loadedOnce.current) setLoading(true);
      setError(null);
      searchBusinesses(query, { categoryId: categoryId || undefined })
        .then((data) => {
          if (signal.cancelled) return;
          setBusinesses(data);
          loadedOnce.current = true;
        })
        .catch((e) => !signal.cancelled && setError(friendlyError(e, t('client_tabs_search.1'))))
        .finally(() => !signal.cancelled && setLoading(false));
    },
    [query, categoryId]
  );

  // При каждом фокусе экрана — сразу; при вводе текста — через 300мс,
  // чтобы не слать запрос на каждую букву.
  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      runSearch(signal);
      return () => {
        signal.cancelled = true;
      };
    }, [runSearch])
  );
  useEffect(() => {
    const signal = { cancelled: false };
    const t = setTimeout(() => runSearch(signal), 300);
    return () => {
      signal.cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <Text style={styles.title}>{title || t('common.46')}</Text>
        <View style={styles.searchBar}>
          <SearchIcon size={16} color={COLORS.sub} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('common.45')}
            placeholderTextColor={COLORS.sub}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
        <Text style={styles.count}>{tn('plural.salons', businesses.length)} · {t('common.1')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxl }} color={COLORS.indigo} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {businesses.length === 0 ? (
            <Text style={styles.emptyText}>{t('client_tabs_search.3')}</Text>
          ) : (
            businesses.map((b, i) => (
              <Animated.View key={b.id} entering={reducedMotion ? undefined : FadeIn.duration(220).delay(i * 30)}>
              <PressableScale style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={() => router.push(`/salon/${b.id}`)}>
                <View style={[styles.photo, { backgroundColor: tintFor(b.id)[0] }]}>
                  {b.logo_url ? (
                    <Image source={{ uri: b.logo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Text style={styles.photoLabel}>{t('common.44')}</Text>
                  )}
                </View>
                <View style={styles.cardRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardName}>{b.name}</Text>
                    <Text style={styles.cardMeta}>
                      {b.city}
                      {b.district ? ` · ${b.district}` : ''}
                    </Text>
                  </View>
                </View>
              </PressableScale>
              </Animated.View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  headerBar: {
    paddingTop: 56,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  title: { fontFamily: FONT.bold, fontSize: 17, color: COLORS.ink, letterSpacing: -0.3 },
  searchBar: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    height: 44,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
  },
  searchInput: { flex: 1, fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.text, padding: 0 },
  count: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: SPACING.sm },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, margin: SPACING.xl },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  list: { padding: SPACING.xl, gap: SPACING.md },
  card: {},
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  photo: { height: 168, borderRadius: RADIUS.xl, overflow: 'hidden' },
  photoLabel: { position: 'absolute', right: 12, bottom: 10, fontFamily: FONT.semibold, fontSize: 10, color: 'rgba(11,17,32,.3)', letterSpacing: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.md, paddingTop: 11 },
  cardName: { fontFamily: FONT.bold, fontSize: 15.5, color: COLORS.ink, letterSpacing: -0.2 },
  cardMeta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
});
