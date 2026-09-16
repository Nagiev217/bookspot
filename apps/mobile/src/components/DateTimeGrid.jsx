// Сетка выбора даты+времени по реальной доступности (get_availability).
// Используется в ручной записи бизнеса (manual-booking). booking/[idx].jsx
// и reschedule/[bookingId].jsx реализуют тот же паттерн инлайн — оставлены
// как есть, не трогаем уже протестированный рабочий код ради рефакторинга.
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function bakuToday() {
  return new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
}
export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dowOf(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export default function DateTimeGrid({ loading, availability, selectedDate, onSelectDate, time, onSelectTime, daysWindow = 14 }) {
  if (loading) return <ActivityIndicator color={COLORS.indigo} style={{ marginTop: SPACING.xl }} />;

  const dateList = Array.from({ length: daysWindow }, (_, i) => addDaysISO(bakuToday(), i));
  const timesForSelected = (selectedDate && availability?.[selectedDate]) || [];

  return (
    <View>
      <Text style={styles.sectionLabel}>Дата</Text>
      <View style={styles.dateGrid}>
        {dateList.map((iso) => {
          const count = availability?.[iso]?.length ?? 0;
          const off = count === 0;
          const on = selectedDate === iso;
          return (
            <Pressable
              key={iso}
              disabled={off}
              style={[styles.dateCell, on && styles.dateCellActive, off && styles.dateCellOff]}
              onPress={() => onSelectDate(iso)}
            >
              <Text style={[styles.dateDow, on && styles.dateTextActive]}>{DOW[dowOf(iso)]}</Text>
              <Text style={[styles.dateNum, on && styles.dateTextActive, off && styles.dateTextOff]}>{iso.slice(8, 10)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Время</Text>
      {timesForSelected.length === 0 ? (
        <Text style={styles.emptyText}>На этот день свободного времени не осталось.</Text>
      ) : (
        <View style={styles.timeGrid}>
          {timesForSelected.map((t) => {
            const on = time === t;
            return (
              <Pressable key={t} style={[styles.timeSlot, on && styles.timeSlotActive]} onPress={() => onSelectTime(t)}>
                <Text style={[styles.timeText, on && styles.timeTextActive]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.md, marginTop: SPACING.lg },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
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
  dateTextActive: { color: COLORS.white, opacity: 1 },
  dateTextOff: { color: '#C3C8D4' },
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
  timeText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  timeTextActive: { color: COLORS.white },
});
