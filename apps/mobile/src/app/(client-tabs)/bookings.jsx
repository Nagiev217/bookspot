// Мои записи — перенесено из дизайн-canvas ("isBookings").
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import StarBadge from '@/components/StarBadge';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { UPCOMING, PAST, TINTS } from '@/data/salonMock';

export default function Bookings() {
  const [tab, setTab] = useState('up');

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Мои записи</Text>
        <View style={styles.segment}>
          <Pressable style={[styles.segTab, tab === 'up' && styles.segTabOn]} onPress={() => setTab('up')}>
            <Text style={[styles.segText, tab === 'up' && styles.segTextOn]}>Предстоящие</Text>
          </Pressable>
          <Pressable style={[styles.segTab, tab === 'past' && styles.segTabOn]} onPress={() => setTab('past')}>
            <Text style={[styles.segText, tab === 'past' && styles.segTextOn]}>История</Text>
          </Pressable>
        </View>
      </View>

      {tab === 'up' ? (
        <ScrollView contentContainerStyle={styles.list}>
          {UPCOMING.map((b) => (
            <View key={b.salon + b.when} style={styles.upcomingCard}>
              <View style={styles.upcomingHeader}>
                <View style={styles.dot} />
                <Text style={styles.whenText}>{b.when}</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.statusText}>{b.status}</Text>
              </View>
              <Pressable style={styles.upcomingBody} onPress={() => router.push(`/salon/${b.idx}`)}>
                <View style={[styles.thumb, { backgroundColor: TINTS[b.idx % TINTS.length][0] }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.salonName}>{b.salon}</Text>
                  <Text style={styles.subText}>{b.service}</Text>
                  <Text style={styles.subText}>
                    {b.master} · {b.address}
                  </Text>
                </View>
                <Text style={styles.priceText}>{b.price} ₼</Text>
              </Pressable>
              <View style={styles.upcomingActions}>
                <Pressable style={styles.outlineButton} onPress={() => router.push(`/salon/${b.idx}`)}>
                  <Text style={styles.outlineButtonText}>Перенести</Text>
                </Pressable>
                <Pressable style={styles.darkButton} onPress={() => router.push(`/salon/${b.idx}`)}>
                  <Text style={styles.darkButtonText}>Маршрут</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>Отмена бесплатна не позднее чем за 4 часа до визита.</Text>
            <Pressable style={styles.noticeButton} onPress={() => router.push('/(client-tabs)/search')}>
              <Text style={styles.noticeButtonText}>Найти ещё</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {PAST.map((b) => (
            <Pressable key={b.salon + b.when} style={styles.pastRow} onPress={() => router.push(`/salon/${b.idx}`)}>
              <View style={[styles.pastThumb, { backgroundColor: TINTS[b.idx % TINTS.length][0] }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.salonName}>{b.salon}</Text>
                <Text style={styles.subText}>
                  {b.service} · {b.when}
                </Text>
                <StarBadge rating={b.rated} style={{ marginTop: 6 }} />
              </View>
              <View style={styles.repeatButton}>
                <Text style={styles.repeatButtonText}>Повторить</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  header: { paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  title: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xxl, color: COLORS.ink, letterSpacing: -0.6 },
  segment: { flexDirection: 'row', gap: 4, marginTop: SPACING.lg, padding: 4, backgroundColor: COLORS.surface, borderRadius: 14 },
  segTab: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segTabOn: { backgroundColor: COLORS.white, shadowColor: '#0B1120', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.sub },
  segTextOn: { color: COLORS.ink },
  list: { padding: SPACING.xl, gap: SPACING.md },
  upcomingCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, overflow: 'hidden' },
  upcomingHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md, paddingHorizontal: 16, backgroundColor: COLORS.indigo100 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.indigo },
  whenText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.indigo },
  statusText: { fontFamily: FONT.semibold, fontSize: 11.5, color: COLORS.sub },
  upcomingBody: { flexDirection: 'row', gap: 13, alignItems: 'center', padding: 16 },
  thumb: { width: 58, height: 58, borderRadius: RADIUS.md },
  salonName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.ink },
  subText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  priceText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  upcomingActions: { flexDirection: 'row', gap: SPACING.sm, padding: 16, paddingTop: 0 },
  outlineButton: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center' },
  outlineButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  darkButton: { flex: 1, height: 44, borderRadius: 14, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  darkButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
  noticeCard: { padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: COLORS.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 13 },
  noticeText: { flex: 1, fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, lineHeight: 19 },
  noticeButton: { height: 40, paddingHorizontal: 14, borderRadius: 13, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  noticeButtonText: { fontFamily: FONT.bold, fontSize: 12.5, color: COLORS.indigo },
  pastRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center', padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.md },
  pastThumb: { width: 54, height: 54, borderRadius: 17, opacity: 0.75 },
  repeatButton: { height: 38, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center' },
  repeatButtonText: { fontFamily: FONT.bold, fontSize: 12.5, color: COLORS.ink },
});
