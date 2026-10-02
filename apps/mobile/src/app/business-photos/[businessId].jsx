// Фото салона — галерея до 5 снимков (0024). Первое фото — обложка: его
// показывают каталог, поиск и избранное (logo_url ставит триггер
// sync_business_cover на сервере). Лимит 5 проверяет и сервер.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Star } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { listBusinessPhotos, addBusinessPhoto, deleteBusinessPhoto, setCoverPhoto } from '@/utils/supabase/business';
import { t } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';

const MAX_PHOTOS = 5;

export default function BusinessPhotosScreen() {
  const { businessId } = useLocalSearchParams();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const data = await listBusinessPhotos(businessId);
    setPhotos(data);
  }, [businessId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      listBusinessPhotos(businessId)
        .then((data) => !cancelled && setPhotos(data))
        .catch((e) => !cancelled && setError(friendlyError(e, t('common.61'))))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [businessId])
  );

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(friendlyError(e, t('common.39')));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(t('common.62'));
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled) return;
    const nextPosition = photos.length ? Math.max(...photos.map((p) => p.position)) + 1 : 0;
    run(() => addBusinessPhoto(businessId, result.assets[0].base64, nextPosition));
  }

  function handleDelete(photo) {
    Alert.alert(t('business_photos_businessId.1'), t('business_photos_businessId.2'), [
      { text: t('common.23'), style: 'cancel' },
      { text: t('common.63'), style: 'destructive', onPress: () => run(() => deleteBusinessPhoto(photo)) },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }

  const canAdd = photos.length < MAX_PHOTOS;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
        <Text style={styles.title}>{t('business_photos_businessId.3')}</Text>
        <Text style={styles.counter}>
          {photos.length}/{MAX_PHOTOS}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>{t('photos.hint', { n: MAX_PHOTOS })}</Text>

        {photos.map((p, i) => (
          <View key={p.id} style={styles.photoCard}>
            <Image source={{ uri: p.url }} style={styles.photo} contentFit="cover" />
            {i === 0 && (
              <View style={styles.coverBadge}>
                <Text style={styles.coverBadgeText}>{t('business_photos_businessId.6')}</Text>
              </View>
            )}
            <View style={styles.actions}>
              {i > 0 && (
                <PressableScale style={styles.actionButton} disabled={busy} onPress={() => run(() => setCoverPhoto(photos, p.id))}>
                  <Star size={15} color={COLORS.ink} />
                  <Text style={styles.actionText}>{t('business_photos_businessId.7')}</Text>
                </PressableScale>
              )}
              <PressableScale style={styles.actionButton} disabled={busy} onPress={() => handleDelete(p)} accessibilityLabel={t('business_photos_businessId.8')}>
                <Trash2 size={15} color={COLORS.danger} />
                <Text style={[styles.actionText, { color: COLORS.danger }]}>{t('common.63')}</Text>
              </PressableScale>
            </View>
          </View>
        ))}

        {canAdd && (
          <PressableScale style={styles.addBox} onPress={handleAdd} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={COLORS.indigo} />
            ) : (
              <>
                <Plus size={22} color={COLORS.indigo} />
                <Text style={styles.addText}>{t('business_photos_businessId.9')}</Text>
              </>
            )}
          </PressableScale>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  backButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, letterSpacing: -0.4 },
  counter: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.sub },
  content: { padding: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.md },
  hint: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, lineHeight: 18 },
  photoCard: { borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.surface },
  photo: { width: '100%', aspectRatio: 4 / 3 },
  coverBadge: { position: 'absolute', top: SPACING.md, left: SPACING.md, paddingVertical: 4, paddingHorizontal: 10, borderRadius: RADIUS.pill, backgroundColor: COLORS.indigo },
  coverBadgeText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.xs, color: COLORS.white },
  actions: { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.sm },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.white },
  actionText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  addBox: { height: 120, borderRadius: RADIUS.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.indigo, backgroundColor: COLORS.indigo100, alignItems: 'center', justifyContent: 'center', gap: 6 },
  addText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.indigo },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger },
});
