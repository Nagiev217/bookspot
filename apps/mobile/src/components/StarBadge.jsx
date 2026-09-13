// Бейдж "★ 4.9" — повторяется на карточках салона, странице салона, мастерах.
import { View, Text, StyleSheet } from 'react-native';
import { Star } from 'lucide-react-native';
import { COLORS, FONT, TEXT_SIZE } from '@/theme/tokens';

export default function StarBadge({ rating, extra, style }) {
  return (
    <View style={[styles.badge, style]}>
      <Star size={11} color={COLORS.star} fill={COLORS.star} />
      <Text style={styles.text}>
        {rating}
        {extra ? ` · ${extra}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  text: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
});
