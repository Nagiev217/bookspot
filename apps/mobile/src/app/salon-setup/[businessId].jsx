// «Настройте ваш салон» — чек-лист нового салона (0024). Пока владелец не
// пройдёт все пункты и не нажмёт «Опубликовать», салона нет в каталоге и
// записаться в него нельзя. Статус считает сервер (business_setup_status),
// publish_business перепроверяет его ещё раз.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { getSetupStatus, publishBusiness } from '@/utils/supabase/business';
import { t } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';

function stepsFor(businessId, status) {
  return [
    {
      key: 'description',
      title: t('salon_setup_businessId.1'),
      text: t('salon_setup_businessId.2'),
      href: `/business-settings/${businessId}`,
    },
    {
      key: 'location',
      title: t('setup.location.title'),
      text: t('setup.location.text'),
      href: `/business-location/${businessId}`,
    },
    {
      key: 'photos',
      title: t('salon_setup_businessId.3', { p0: status?.photos_count ?? 0 }),
      text: t('salon_setup_businessId.4'),
      href: `/business-photos/${businessId}`,
    },
    {
      key: 'masters',
      title: t('salon_setup_businessId.5'),
      text: t('salon_setup_businessId.6'),
      href: '/(business-tabs)/team',
    },
    {
      key: 'schedule',
      title: t('salon_setup_businessId.7'),
      text: t('salon_setup_businessId.8'),
      href: '/(business-tabs)/team',
    },
    {
      key: 'services',
      title: t('salon_setup_businessId.9'),
      text: t('salon_setup_businessId.10'),
      href: `/services/${businessId}`,
    },
  ];
}

export default function SalonSetupScreen() {
  const { businessId } = useLocalSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);

  // На каждый фокус: владелец уходит на экран пункта и возвращается —
  // галочки должны сразу отражать сделанное.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getSetupStatus(businessId)
        .then((s) => !cancelled && setStatus(s))
        .catch((e) => !cancelled && setError(friendlyError(e, t('common.20'))))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [businessId])
  );

  const steps = stepsFor(businessId, status);
  const doneCount = steps.filter((s) => status?.[s.key]).length;
  const allDone = doneCount === steps.length;

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/(business-tabs)');
  }

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      await publishBusiness(businessId);
      Alert.alert(t('salon_setup_businessId.11'), t('salon_setup_businessId.12'), [
        { text: t('salon_setup_businessId.13'), onPress: () => router.replace('/(business-tabs)') },
      ]);
    } catch (e) {
      setError(friendlyError(e, t('salon_setup_businessId.14')));
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale style={styles.backButton} onPress={close} accessibilityLabel={t('salon_setup_businessId.15')}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{status?.published ? t('salon_setup_businessId.11') : t('salon_setup_businessId.16')}</Text>
        <Text style={styles.subtitle}>
          {status?.published
            ? t('salon_setup_businessId.17')
            : t('salon_setup_businessId.18')}
        </Text>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(doneCount / steps.length) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {doneCount}{' '}{t('salon_setup_businessId.19')}{' '}{steps.length}
          </Text>
        </View>

        {steps.map((s, i) => {
          const done = !!status?.[s.key];
          return (
            <PressableScale key={s.key} style={[styles.step, done && styles.stepDone]} onPress={() => router.push(s.href)}>
              <View style={[styles.stepIcon, done && styles.stepIconDone]}>
                {done ? <Check size={16} color={COLORS.white} strokeWidth={3} /> : <Text style={styles.stepNumber}>{i + 1}</Text>}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
              <ChevronRight size={18} color={COLORS.subLight} />
            </PressableScale>
          );
        })}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {!status?.published && (
        <View style={styles.footer}>
          <PressableScale
            style={[styles.publishButton, !allDone && styles.publishButtonOff]}
            onPress={handlePublish}
            disabled={!allDone || publishing}
          >
            {publishing ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.publishText}>{allDone ? t('salon_setup_businessId.20') : t('salon_setup_businessId.21', { p0: steps.length - doneCount })}</Text>
            )}
          </PressableScale>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  header: { paddingTop: 56, paddingHorizontal: SPACING.xl },
  backButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.xl, gap: SPACING.md, paddingBottom: 120 },
  title: { fontFamily: FONT.extrabold, fontSize: 26, color: COLORS.ink, letterSpacing: -0.6 },
  subtitle: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub, lineHeight: 20 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginVertical: SPACING.sm },
  progressTrack: { flex: 1, height: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: RADIUS.pill, backgroundColor: COLORS.indigo },
  progressText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  step: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceAlt },
  stepDone: { backgroundColor: COLORS.indigo100 },
  stepIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: COLORS.subLight, alignItems: 'center', justifyContent: 'center' },
  stepIconDone: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  stepNumber: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  stepTitle: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  stepText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3, lineHeight: 17 },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: SPACING.xl, paddingBottom: 34, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  publishButton: { height: 52, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  publishButtonOff: { backgroundColor: COLORS.subLight },
  publishText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.white },
});
