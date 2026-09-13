// Дашборд бизнеса — заглушка. Услуги/мастера/расписание/календарь — P1.2-P1.6.
import { View, Text, StyleSheet } from 'react-native';
import { useAuthStore } from '@/utils/auth/store';
import { COLORS, SPACING, FONT, TEXT_SIZE } from '@/theme/tokens';

export default function BusinessDashboard() {
  const businessId = useAuthStore((s) => s.businessId);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Дашборд</Text>
      <Text style={styles.subtitle}>businessId: {businessId}</Text>
      <Text style={styles.subtitle}>Услуги, мастера и календарь появятся в Фазе 1</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, backgroundColor: COLORS.white },
  title: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.xl, color: COLORS.text, marginBottom: SPACING.sm },
  subtitle: { fontFamily: FONT.regular, fontSize: TEXT_SIZE.sm, color: COLORS.sub, textAlign: 'center' },
});
