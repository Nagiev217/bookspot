// Часы работы салона в карточке: «Сейчас открыто · до 19:00» и неделя
// группами одинаковых дней («Пн–Сб 10:00–19:00», «Вс — выходной»).
// Часы — объединение расписаний активных мастеров (listBusinessHours).
import { View, Text, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';
import { COLORS, SPACING, FONT, TEXT_SIZE } from '@/theme/tokens';
import { dowShort } from '@/utils/i18n/dates';
import { t } from '@/utils/i18n';

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // с понедельника
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default function SalonHours({ hours }) {
  if (!hours || Object.keys(hours).length === 0) return null;

  const key = (d) => (hours[d] ? `${hours[d][0]}-${hours[d][1]}` : 'off');
  const groups = [];
  for (const d of WEEK) {
    const last = groups[groups.length - 1];
    if (last && last.key === key(d)) last.days.push(d);
    else groups.push({ key: key(d), days: [d] });
  }

  const now = new Date(Date.now() + 4 * 3600e3);
  const today = hours[now.getUTCDay()];
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const open = today && nowMin >= today[0] && nowMin < today[1];

  return (
    <View style={styles.wrap}>
      <View style={styles.statusRow}>
        <Clock size={18} color={open ? COLORS.success : COLORS.sub} />
        <Text style={[styles.status, { color: open ? COLORS.success : COLORS.ink }]}>
          {open ? t('hours.openUntil', { time: hhmm(today[1]) }) : t('hours.closedNow')}
        </Text>
      </View>
      {groups.map((g) => {
        const days = g.days.length > 1 ? `${dowShort(g.days[0])}–${dowShort(g.days[g.days.length - 1])}` : dowShort(g.days[0]);
        const h = hours[g.days[0]];
        return (
          <View key={g.days.join()} style={styles.row}>
            <Text style={styles.days}>{days}</Text>
            <Text style={[styles.time, !h && styles.off]}>{h ? `${hhmm(h[0])}–${hhmm(h[1])}` : t('hours.dayOff')}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: SPACING.md, gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 2 },
  status: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 26 },
  days: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  time: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.ink },
  off: { color: COLORS.sub },
});
