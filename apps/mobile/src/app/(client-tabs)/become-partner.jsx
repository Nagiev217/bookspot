// «Стать партнёром» — салоны подключаются через WhatsApp: обсуждаем
// подписку, после оплаты admin создаёт салон и аккаунт владельца
// (admin-tabs/create.jsx). Самостоятельная регистрация салона закрыта
// (0022: create_business больше не доступна authenticated).
import { View, Text, StyleSheet, Linking, Alert, ScrollView } from 'react-native';
import { MessageCircle, CalendarCheck, Users, BellRing } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { PARTNER_WHATSAPP, hasPartnerWhatsapp, whatsappUrl } from '@/utils/contact';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { t } from '@/utils/i18n';

const points = () => [
  { Icon: CalendarCheck, text: t('client_tabs_become_partner.1') },
  { Icon: BellRing, text: t('client_tabs_become_partner.2') },
  { Icon: Users, text: t('client_tabs_become_partner.3') },
];

export default function BecomePartner() {
  async function openWhatsapp() {
    if (!hasPartnerWhatsapp()) {
      Alert.alert(t('client_tabs_become_partner.4'), t('client_tabs_become_partner.5'));
      return;
    }
    try {
      await Linking.openURL(whatsappUrl(t('client_tabs_become_partner.6'), PARTNER_WHATSAPP));
    } catch {
      Alert.alert(t('common.36'), t('client_tabs_become_partner.7'));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{t('common.37')}</Text>
      <Text style={styles.subtitle}>{t('client_tabs_become_partner.8')}</Text>

      <View style={styles.points}>
        {points().map(({ Icon, text }) => (
          <View key={text} style={styles.point}>
            <View style={styles.pointIcon}>
              <Icon size={18} color={COLORS.indigo} />
            </View>
            <Text style={styles.pointText}>{text}</Text>
          </View>
        ))}
      </View>

      <PressableScale style={styles.button} onPress={openWhatsapp}>
        <MessageCircle size={18} color={COLORS.white} />
        <Text style={styles.buttonText}>{t('client_tabs_become_partner.9')}</Text>
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: SPACING.xl, paddingTop: 56, backgroundColor: COLORS.white },
  title: { fontFamily: FONT.extrabold, fontSize: TEXT_SIZE.xxl, color: COLORS.ink, letterSpacing: -0.6 },
  subtitle: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.md, color: COLORS.sub, marginTop: SPACING.sm, lineHeight: 21 },
  points: { gap: SPACING.md, marginVertical: SPACING.xxl },
  point: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  pointIcon: { width: 40, height: 40, borderRadius: RADIUS.sm, backgroundColor: COLORS.indigo50, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.ink, lineHeight: 20 },
  button: { flexDirection: 'row', gap: SPACING.sm, height: 54, borderRadius: RADIUS.md, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.white },
});
