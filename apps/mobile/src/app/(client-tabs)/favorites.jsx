// Избранное — в дизайне это заглушка ("isStub"), реальный экран не в этой фазе.
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

export default function Favorites() {
  return (
    <View style={styles.screen}>
      <View style={styles.icon} />
      <Text style={styles.title}>Избранное</Text>
      <Text style={styles.subtitle}>
        Экран в следующей итерации — сейчас в макетах Home, список салонов и booking flow.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: COLORS.white },
  icon: { width: 62, height: 62, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface },
  title: { fontFamily: FONT.bold, fontSize: 17, color: COLORS.ink, marginTop: SPACING.lg },
  subtitle: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 7, maxWidth: 230, textAlign: 'center', lineHeight: 19 },
});
