// Избранное — реальный список, сохранённый через favorites (0009_favorites.sql).
// Карточка — тот же стиль, что и в search.jsx (переиспользовать компонент
// пока не стоит: два места, разница только в источнике данных).
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import PressableScale from '@/components/PressableScale';
import Animated, { FadeIn } from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { tintFor } from '@/utils/tint';
import { useAuthStore } from '@/utils/auth/store';
import { listFavoriteBusinesses } from '@/utils/supabase/favorites';
import { useReducedMotion } from '@/utils/useReducedMotion';
import SignInPrompt from '@/components/SignInPrompt';
import { t } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';

export default function Favorites() {
  const uid = useAuthStore((s) => s.uid);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);
  const reducedMotion = useReducedMotion();

  const load = useCallback(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    listFavoriteBusinesses(uid)
      .then((data) => {
        if (cancelled) return;
        setBusinesses(data);
        loadedOnce.current = true;
      })
      .catch((e) => !cancelled && setError(friendlyError(e, t('client_tabs_favorites.1'))))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Отдельно от useFocusEffect: с lazy:false вкладка монтируется сразу
  // после входа, но useFocusEffect не срабатывает, пока пользователь
  // реально не переключится на неё — без этого первый переход всё равно
  // ждал бы сеть.
  useEffect(() => load(), [load]);

  useFocusEffect(load);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }

  if (!uid) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t('common.43')}</Text>
        <SignInPrompt
          title={t('client_tabs_favorites.2')}
          subtitle={t('client_tabs_favorites.3')}
          redirect="/(client-tabs)/favorites"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('common.43')}</Text>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {businesses.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.icon} />
          <Text style={styles.emptyTitle}>{t('client_tabs_favorites.4')}</Text>
          <Text style={styles.emptySubtitle}>{t('client_tabs_favorites.5')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {businesses.map((b, i) => (
            <Animated.View key={b.id} entering={reducedMotion ? undefined : FadeIn.duration(220).delay(i * 30)}>
              <PressableScale style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={() => router.push(`/salon/${b.id}`)}>
                <View style={[styles.photo, { backgroundColor: tintFor(b.id)[0] }]}>
                  {b.logo_url ? (
                    <Image source={{ uri: b.logo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Text style={styles.photoLabel}>{t('common.44')}</Text>
                  )}
                </View>
                <Text style={styles.cardName}>{b.name}</Text>
                <Text style={styles.cardMeta}>
                  {b.city}
                  {b.district ? ` · ${b.district}` : ''}
                </Text>
              </PressableScale>
            </Animated.View>
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
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  photo: { height: 150, borderRadius: RADIUS.xl, overflow: 'hidden' },
  photoLabel: { position: 'absolute', right: 12, bottom: 10, fontFamily: FONT.semibold, fontSize: 10, color: 'rgba(11,17,32,.3)', letterSpacing: 1 },
  cardName: { fontFamily: FONT.bold, fontSize: 15.5, color: COLORS.ink, letterSpacing: -0.2, marginTop: 11 },
  cardMeta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
});
