// Логин и временный пароль нового аккаунта + отправка в WhatsApp. Общая для
// admin (аккаунт владельца салона) и владельца (аккаунт мастера). Пароль
// показывается один раз — после закрытия экрана его можно только сбросить.
import { View, Text, StyleSheet, Linking, Share, Alert } from 'react-native';
import { MessageCircle, Share2 } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { whatsappUrl } from '@/utils/contact';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { t } from '@/utils/i18n';

export function credentialsMessage({ name, email, password, businessName }) {
  return [
    t('components_CredentialsCard.1', { p0: name ? `, ${name}` : '' }),
    businessName ? t('components_CredentialsCard.2', { businessName }) : t('components_CredentialsCard.3'),
    t('components_CredentialsCard.4', { email }),
    t('components_CredentialsCard.5', { password }),
    t('components_CredentialsCard.6'),
  ].join('\n');
}

export default function CredentialsCard({ title, name, email, password, phone, businessName }) {
  const message = credentialsMessage({ name, email, password, businessName });

  async function sendWhatsapp() {
    try {
      await Linking.openURL(whatsappUrl(message, phone));
    } catch {
      Alert.alert(t('common.36'), t('components_CredentialsCard.7'));
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.row}>
        <Text style={styles.key}>{t('components_CredentialsCard.8')}</Text>
        <Text style={styles.value} selectable>{email}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.key}>{t('components_CredentialsCard.9')}</Text>
        <Text style={[styles.value, styles.password]} selectable>{password}</Text>
      </View>
      <Text style={styles.hint}>{t('components_CredentialsCard.10')}</Text>

      <PressableScale style={styles.waButton} onPress={sendWhatsapp}>
        <MessageCircle size={18} color={COLORS.white} />
        <Text style={styles.waText}>{t('components_CredentialsCard.11')}</Text>
      </PressableScale>
      <PressableScale style={styles.shareButton} onPress={() => Share.share({ message })}>
        <Share2 size={16} color={COLORS.ink} />
        <Text style={styles.shareText}>{t('components_CredentialsCard.12')}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.md },
  title: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.lg, color: COLORS.ink },
  row: { gap: 4 },
  key: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  value: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.ink },
  password: { fontSize: 22, letterSpacing: 1.5, color: COLORS.indigo },
  hint: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub, lineHeight: 16 },
  waButton: { flexDirection: 'row', gap: SPACING.sm, height: 50, borderRadius: RADIUS.md, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center' },
  waText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.white },
  shareButton: { flexDirection: 'row', gap: SPACING.sm, height: 46, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center' },
  shareText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
});
