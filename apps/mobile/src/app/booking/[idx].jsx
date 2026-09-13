// Booking flow (услуга → мастер → дата → время → подтверждение) —
// перенесено из дизайн-canvas ("isBooking"/"isConfirm"). Один экран с
// внутренним состоянием шага, как и в самом дизайне (там это тоже не
// отдельные роуты, а sc-if внутри одного компонента).
import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import StarBadge from '@/components/StarBadge';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { SALONS, SERVICES, MASTERS, DATES, TIME_GROUPS, TINTS } from '@/data/salonMock';

const STEP_TITLES = ['Выберите услугу', 'Выберите мастера', 'Выберите дату', 'Выберите время'];

export default function Booking() {
  const params = useLocalSearchParams();
  const salonIdx = Number(params.idx) || 0;
  const salon = SALONS[salonIdx] ?? SALONS[0];
  const tint = TINTS[salonIdx % TINTS.length][0];

  const [step, setStep] = useState(1);
  const [serviceIdx, setServiceIdx] = useState(params.service !== undefined ? Number(params.service) : 0);
  const [masterIdx, setMasterIdx] = useState(null);
  const [dateIdx, setDateIdx] = useState(1);
  const [time, setTime] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const service = SERVICES[serviceIdx];
  const master = masterIdx === null ? null : MASTERS[masterIdx];
  const date = DATES[dateIdx];

  const canNext = step === 1 ? true : step === 2 ? master !== null : step === 3 ? true : time !== null;

  function stepBack() {
    if (step === 1) router.back();
    else setStep((s) => s - 1);
  }

  function stepNext() {
    if (!canNext) return;
    if (step === 4) setConfirmed(true);
    else setStep((s) => s + 1);
  }

  if (confirmed) {
    return (
      <ConfirmScreen
        salon={salon}
        tint={tint}
        service={service}
        master={master}
        date={date}
        time={time}
        onDone={() => router.replace('/(client-tabs)')}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerBar}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={stepBack}>
            <ArrowLeft size={17} color={COLORS.ink} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{STEP_TITLES[step - 1]}</Text>
            <Text style={styles.stepSub}>
              Шаг {step} из 4 · {salon.name}
            </Text>
          </View>
        </View>
        <View style={styles.progressRow}>
          {[1, 2, 3, 4].map((n) => (
            <View key={n} style={[styles.progressBar, { backgroundColor: n <= step ? COLORS.indigo : 'rgba(11,17,32,.1)' }]} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {step === 1 && (
          <View style={{ gap: SPACING.sm }}>
            {SERVICES.map((v, i) => (
              <Pressable
                key={v.name}
                style={[styles.row, serviceIdx === i && styles.rowActive]}
                onPress={() => setServiceIdx(i)}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName}>{v.name}</Text>
                  <Text style={styles.rowSub}>{v.dur}</Text>
                </View>
                <Text style={styles.rowPrice}>{v.price} ₼</Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: SPACING.sm }}>
            {MASTERS.map((m, i) => (
              <Pressable
                key={m.name}
                style={[styles.row, masterIdx === i && styles.rowActive]}
                onPress={() => setMasterIdx(i)}
              >
                <View style={[styles.masterThumb, { backgroundColor: TINTS[(i + 1) % TINTS.length][0] }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName}>{m.name}</Text>
                  <Text style={styles.rowSub}>
                    {m.role} · {m.exp}
                  </Text>
                </View>
                <StarBadge rating={m.rating} />
              </Pressable>
            ))}
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.monthLabel}>Сентябрь 2026</Text>
            <View style={styles.dateGrid}>
              {DATES.map((d, i) => (
                <Pressable
                  key={`${d.dow}-${d.num}`}
                  disabled={d.off}
                  style={[styles.dateCell, dateIdx === i && styles.dateCellActive, d.off && styles.dateCellOff]}
                  onPress={() => setDateIdx(i)}
                >
                  <Text style={[styles.dateDow, dateIdx === i && styles.dateTextActive]}>{d.dow}</Text>
                  <Text style={[styles.dateNum, dateIdx === i && styles.dateTextActive, d.off && styles.dateTextOff]}>{d.num}</Text>
                  <Text style={[styles.dateFree, dateIdx === i && styles.dateTextActive, d.off && styles.dateTextOff]}>{d.free}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={{ gap: SPACING.xxl }}>
            {TIME_GROUPS.map((g) => (
              <View key={g.label}>
                <Text style={styles.timeLabel}>{g.label}</Text>
                <View style={styles.timeGrid}>
                  {g.slots.map((t) => {
                    const off = g.off.includes(t);
                    const on = time === t;
                    return (
                      <Pressable
                        key={t}
                        disabled={off}
                        style={[styles.timeSlot, on && styles.timeSlotActive, off && styles.timeSlotOff]}
                        onPress={() => setTime(t)}
                      >
                        <Text style={[styles.timeText, on && styles.timeTextActive, off && styles.timeTextOff]}>{t}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.ctaBar}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText} numberOfLines={1}>
            {[service.name, master?.name, step >= 3 ? `${date.num} сент` : null, time].filter(Boolean).join(' · ') || 'Выберите услугу'}
          </Text>
          <Text style={styles.summaryPrice}>{service.price} ₼</Text>
        </View>
        <Pressable style={[styles.ctaButton, !canNext && styles.ctaButtonOff]} onPress={stepNext} disabled={!canNext}>
          <Text style={[styles.ctaText, !canNext && styles.ctaTextOff]}>{step === 4 ? 'Подтвердить запись' : 'Далее'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ConfirmScreen({ salon, tint, service, master, date, time, onDone }) {
  const receipt = [
    { k: 'Услуга', v: `${service.name} · ${service.dur}` },
    { k: 'Мастер', v: master ? `${master.name}, ${master.role}` : 'Любой свободный' },
    { k: 'Дата', v: `${date.dow}, ${date.num} сентября` },
    { k: 'Время', v: time || '18:00' },
  ];

  return (
    <View style={styles.confirmScreen}>
      <View style={styles.confirmIcon}>
        <Check size={30} color={COLORS.indigo} strokeWidth={2.2} />
      </View>
      <Text style={styles.confirmTitle}>Вы записаны</Text>
      <Text style={styles.confirmSub}>Мы напомним за 2 часа до визита. Оплата на месте.</Text>

      <View style={styles.receiptCard}>
        <View style={styles.receiptHeader}>
          <View style={[styles.receiptThumb, { backgroundColor: tint }]} />
          <View>
            <Text style={styles.rowName}>{salon.name}</Text>
            <Text style={styles.rowSub}>{salon.meta}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        {receipt.map((r) => (
          <View key={r.k} style={styles.receiptRow}>
            <Text style={styles.receiptKey}>{r.k}</Text>
            <Text style={styles.receiptVal}>{r.v}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={[styles.receiptRow, styles.receiptTotal]}>
          <Text style={styles.rowName}>Итого</Text>
          <Text style={styles.confirmPrice}>{service.price} ₼</Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />
      <Pressable style={styles.ctaButton} onPress={onDone}>
        <Text style={styles.ctaText}>Готово</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onDone}>
        <Text style={styles.secondaryButtonText}>Добавить в календарь</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  headerBar: { paddingTop: 52, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  backButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontFamily: FONT.bold, fontSize: 16, color: COLORS.ink, letterSpacing: -0.3 },
  stepSub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 2 },
  progressRow: { flexDirection: 'row', gap: 5, marginTop: SPACING.md },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  body: { padding: SPACING.xl, paddingTop: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: 14,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  rowActive: { backgroundColor: COLORS.indigo100, borderColor: COLORS.indigo },
  rowName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  rowSub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  rowPrice: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  masterThumb: { width: 52, height: 52, borderRadius: 17 },
  monthLabel: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.md },
  dateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  dateCell: {
    width: '22.5%',
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
  },
  dateCellActive: { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo },
  dateCellOff: { borderColor: COLORS.border },
  dateDow: { fontFamily: FONT.semibold, fontSize: 11, color: COLORS.ink, opacity: 0.6 },
  dateNum: { fontFamily: FONT.extrabold, fontSize: 18, color: COLORS.ink, marginTop: 7, letterSpacing: -0.3 },
  dateFree: { fontFamily: FONT.semibold, fontSize: 10, color: COLORS.ink, opacity: 0.6, marginTop: 7 },
  dateTextActive: { color: COLORS.white },
  dateTextOff: { color: '#C3C8D4' },
  timeLabel: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: 11 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  timeSlot: {
    width: '22.5%',
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSlotActive: { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo },
  timeSlotOff: { backgroundColor: COLORS.surfaceAlt, borderColor: COLORS.border },
  timeText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  timeTextActive: { color: COLORS.white },
  timeTextOff: { color: '#C3C8D4' },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingBottom: 26,
    backgroundColor: 'rgba(255,255,255,.94)',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, marginBottom: SPACING.sm },
  summaryText: { flex: 1, fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  summaryPrice: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.base, color: COLORS.ink },
  ctaButton: { height: 54, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  ctaButtonOff: { backgroundColor: '#E7E9F0' },
  ctaText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.white },
  ctaTextOff: { color: '#A9B0BE' },

  confirmScreen: { flex: 1, backgroundColor: COLORS.white, paddingTop: 88, paddingHorizontal: SPACING.xl, paddingBottom: 30 },
  confirmIcon: { width: 66, height: 66, borderRadius: RADIUS.xl, backgroundColor: COLORS.indigo50, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontFamily: FONT.extrabold, fontSize: 27, color: COLORS.ink, letterSpacing: -0.6, marginTop: 22 },
  confirmSub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub, marginTop: 8, lineHeight: 21 },
  receiptCard: { marginTop: 26, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, overflow: 'hidden' },
  receiptHeader: { flexDirection: 'row', gap: 13, alignItems: 'center', padding: 16 },
  receiptThumb: { width: 56, height: 56, borderRadius: RADIUS.md },
  divider: { height: 1, backgroundColor: COLORS.borderLight },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, padding: 13, paddingHorizontal: 16 },
  receiptKey: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  receiptVal: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink, textAlign: 'right' },
  receiptTotal: { backgroundColor: COLORS.surfaceAlt, paddingVertical: 15 },
  confirmPrice: { fontFamily: FONT.extrabold, fontSize: 16, color: COLORS.ink },
  secondaryButton: { height: 52, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm },
  secondaryButtonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
});
