// Список салонов — перенесено из дизайн-canvas ("isList"). Режим "На карте"
// пока заглушка (сама карта — Фаза 2 концепта, geo/PostGIS не в этом плане).
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { router } from 'expo-router';
import { Map, List as ListIcon } from 'lucide-react-native';
import StarBadge from '@/components/StarBadge';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { SALONS, TINTS } from '@/data/salonMock';

const FILTER_NAMES = ['Свободно сегодня', 'Рейтинг 4.8+', 'До 3 км', 'До 60 ₼'];

export default function Search() {
  const { title } = useLocalSearchParams();
  const [active, setActive] = useState({ 'Свободно сегодня': true });
  const [mapMode, setMapMode] = useState(false);

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <Text style={styles.title}>{title || 'Все салоны'}</Text>
        <Text style={styles.count}>{SALONS.length} салона · Баку</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pressable style={styles.mapToggle} onPress={() => setMapMode((v) => !v)}>
            {mapMode ? <ListIcon size={13} color={COLORS.white} /> : <Map size={13} color={COLORS.white} />}
            <Text style={styles.mapToggleText}>{mapMode ? 'Списком' : 'На карте'}</Text>
          </Pressable>
          {FILTER_NAMES.map((f) => (
            <Pressable
              key={f}
              style={[styles.filterPill, active[f] && styles.filterPillOn]}
              onPress={() => setActive((s) => ({ ...s, [f]: !s[f] }))}
            >
              <Text style={[styles.filterText, active[f] && styles.filterTextOn]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {mapMode && (
          <View style={styles.mapStub}>
            <View style={[styles.mapPin, styles.mapPinActive, { left: 74, top: 96 }]}>
              <Text style={styles.mapPinTextActive}>45 ₼</Text>
            </View>
            <View style={[styles.mapPin, { left: 196, top: 64 }]}>
              <Text style={styles.mapPinText}>70 ₼</Text>
            </View>
            <View style={[styles.mapPin, { left: 140, top: 186 }]}>
              <Text style={styles.mapPinText}>120 ₼</Text>
            </View>
            <Text style={styles.mapLabel}>КАРТА</Text>
          </View>
        )}

        {SALONS.map((s, i) => (
          <Pressable key={s.name} style={styles.card} onPress={() => router.push(`/salon/${i}`)}>
            <View style={[styles.photo, { backgroundColor: TINTS[i % TINTS.length][0] }]}>
              <StarBadge rating={s.rating} extra={s.reviews} style={styles.photoBadge} />
              <Text style={styles.photoLabel}>ФОТО</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardName}>{s.name}</Text>
                <Text style={styles.cardMeta}>{s.meta}</Text>
              </View>
              <Text style={styles.cardPrice}>от {s.price} ₼</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
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
  count: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  filterRow: { gap: SPACING.sm, marginTop: SPACING.md, paddingBottom: 2 },
  mapToggle: {
    height: 36,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapToggleText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
  filterPill: { height: 36, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center' },
  filterPillOn: { backgroundColor: COLORS.indigo50, borderColor: COLORS.indigo },
  filterText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: '#3A4256' },
  filterTextOn: { color: COLORS.indigo },
  list: { padding: SPACING.xl, gap: SPACING.md },
  mapStub: { height: 300, borderRadius: RADIUS.xl, backgroundColor: '#E9ECF4', marginBottom: SPACING.xs, overflow: 'hidden' },
  mapPin: {
    position: 'absolute',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: COLORS.white,
  },
  mapPinActive: { backgroundColor: COLORS.indigo },
  mapPinText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  mapPinTextActive: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
  mapLabel: { position: 'absolute', right: 14, bottom: 12, fontFamily: FONT.semibold, fontSize: 10, color: 'rgba(11,17,32,.34)', letterSpacing: 1 },
  card: {},
  photo: { height: 168, borderRadius: RADIUS.xl, overflow: 'hidden' },
  photoBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    height: 27,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,.94)',
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoLabel: { position: 'absolute', right: 12, bottom: 10, fontFamily: FONT.semibold, fontSize: 10, color: 'rgba(11,17,32,.3)', letterSpacing: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACING.md, paddingTop: 11 },
  cardName: { fontFamily: FONT.bold, fontSize: 15.5, color: COLORS.ink, letterSpacing: -0.2 },
  cardMeta: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  cardPrice: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
});
