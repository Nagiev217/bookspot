// Страница салона — перенесено из дизайн-canvas ("isSalon").
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Heart } from 'lucide-react-native';
import StarBadge from '@/components/StarBadge';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { SALONS, SERVICES, MASTERS, TINTS } from '@/data/salonMock';

export default function SalonDetail() {
  const { idx } = useLocalSearchParams();
  const i = Number(idx) || 0;
  const salon = SALONS[i] ?? SALONS[0];
  const tint = TINTS[i % TINTS.length][0];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 104 }}>
        <View style={[styles.hero, { backgroundColor: tint }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={17} color={COLORS.ink} />
          </Pressable>
          <Text style={styles.galleryLabel}>ГАЛЕРЕЯ · 12 ФОТО</Text>
        </View>

        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name}>{salon.name}</Text>
              <Text style={styles.meta}>{salon.meta}</Text>
            </View>
            <StarBadge rating={salon.rating} style={styles.ratingPill} />
          </View>

          <View style={styles.tagRow}>
            <Text style={styles.tag}>Открыто до 21:00</Text>
            <Text style={styles.tag}>Оплата на месте</Text>
          </View>

          <Text style={styles.sectionTitle}>Услуги</Text>
          <View style={{ gap: SPACING.sm }}>
            {SERVICES.map((v, si) => (
              <Pressable
                key={v.name}
                style={styles.serviceRow}
                onPress={() => router.push({ pathname: `/booking/${i}`, params: { service: si } })}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.serviceName}>{v.name}</Text>
                  <Text style={styles.serviceDur}>{v.dur}</Text>
                </View>
                <Text style={styles.servicePrice}>{v.price} ₼</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Мастера</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.md }}>
            {MASTERS.map((m, mi) => (
              <View key={m.name} style={styles.masterCard}>
                <View style={[styles.masterAvatar, { backgroundColor: TINTS[(mi + 1) % TINTS.length][0] }]} />
                <Text style={styles.masterName}>{m.name}</Text>
                <Text style={styles.masterRole}>{m.role}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      <View style={styles.ctaBar}>
        <Pressable style={styles.ctaButton} onPress={() => router.push(`/booking/${i}`)}>
          <Text style={styles.ctaText}>Записаться</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  hero: { height: 300 },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 52,
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryLabel: { position: 'absolute', right: 20, bottom: 16, fontFamily: FONT.semibold, fontSize: 10, color: 'rgba(11,17,32,.32)', letterSpacing: 1 },
  sheet: { marginTop: -26, backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.md },
  name: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xl, color: COLORS.ink, letterSpacing: -0.6 },
  meta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub, marginTop: 5 },
  ratingPill: {
    height: 30,
    paddingHorizontal: 11,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
  },
  tagRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  tag: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: '#3A4256', backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, paddingVertical: 9, paddingHorizontal: 12 },
  sectionTitle: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.ink, letterSpacing: -0.3, marginTop: SPACING.xxl, marginBottom: SPACING.md },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
  },
  serviceName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  serviceDur: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  servicePrice: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  masterCard: { width: 92, alignItems: 'center' },
  masterAvatar: { width: 92, height: 92, borderRadius: RADIUS.lg },
  masterName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink, marginTop: 9 },
  masterRole: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub, marginTop: 2 },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.md,
    paddingBottom: 26,
    paddingHorizontal: SPACING.xl,
    backgroundColor: 'rgba(255,255,255,.94)',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  ctaButton: {
    height: 54,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.white },
});
