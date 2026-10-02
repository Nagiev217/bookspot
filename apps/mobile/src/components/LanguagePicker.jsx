// Переключатель языка интерфейса: az / ru / en. Смена языка перемонтирует
// навигацию (_layout.jsx, key={lang}), поэтому перед сменой запоминаем
// текущий экран — _layout вернёт на него после перемонтирования.
import { View, Text, StyleSheet } from 'react-native';
import { useSegments } from 'expo-router';
import PressableScale from '@/components/PressableScale';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { t, LANGUAGES, useLang, setLang } from '@/utils/i18n';
import { saveMyLang } from '@/utils/supabase/profile';

export default function LanguagePicker() {
  const lang = useLang((s) => s.lang);
  const segments = useSegments();

  function choose(code) {
    if (code === lang) return;
    setLang(code, (c) => saveMyLang(c).catch(() => {}), `/${segments.join('/')}`);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('lang.title')}</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {LANGUAGES.map((l) => {
          const on = l.code === lang;
          return (
            <PressableScale
              key={l.code}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => choose(l.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{l.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACING.xl },
  label: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.sm },
  row: { flexDirection: 'row', gap: SPACING.sm },
  chip: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: COLORS.indigo, borderColor: COLORS.indigo },
  chipText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.ink, textAlign: 'center' },
  chipTextOn: { color: COLORS.white },
});
