// Пустое состояние для экранов, которым нужен аккаунт (бронь, избранное,
// «Мои записи»), когда их открывает гость. Каталог гостю доступен без входа
// (App Store Guideline 5.1.1) — эти экраны единственные, где вход реально
// нужен, и здесь же, в моменте, за него и просят, а не заранее на входе в
// приложение.
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { LogIn } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

export default function SignInPrompt({ title, subtitle, redirect }) {
  return (
    <View style={styles.center}>
      <View style={styles.icon}>
        <LogIn size={24} color={COLORS.indigo} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <PressableScale
        style={styles.button}
        onPress={() => router.push({ pathname: '/(auth)/login', params: redirect ? { redirect } : undefined })}
      >
        <Text style={styles.buttonText}>Войти</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  icon: {
    width: 62,
    height: 62,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.indigo50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: FONT.bold, fontSize: 17, color: COLORS.ink, marginTop: SPACING.lg },
  subtitle: {
    fontFamily: FONT.medium,
    fontSize: TEXT_SIZE.sm,
    color: COLORS.sub,
    marginTop: 7,
    maxWidth: 230,
    textAlign: 'center',
    lineHeight: 19,
  },
  button: {
    backgroundColor: COLORS.indigo,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    marginTop: SPACING.xl,
  },
  buttonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
});
