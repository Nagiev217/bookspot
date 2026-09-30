// «Стать партнёром» — салоны подключаются через WhatsApp: обсуждаем
// подписку, после оплаты admin создаёт салон и аккаунт владельца
// (admin-tabs/create.jsx). Самостоятельная регистрация салона закрыта
// (0022: create_business больше не доступна authenticated).
import { View, Text, StyleSheet, Linking, Alert, ScrollView } from 'react-native';
import { MessageCircle, CalendarCheck, Users, BellRing } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { PARTNER_WHATSAPP, hasPartnerWhatsapp, whatsappUrl } from '@/utils/contact';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';

const POINTS = [
  { Icon: CalendarCheck, text: 'Клиенты записываются сами — только на реально свободное время' },
  { Icon: BellRing, text: 'Подтверждения и напоминания клиентам приходят автоматически' },
  { Icon: Users, text: 'У каждого мастера — свой доступ и своё расписание' },
];

export default function BecomePartner() {
  async function openWhatsapp() {
    if (!hasPartnerWhatsapp()) {
      Alert.alert('Скоро', 'Контакт для партнёров появится в ближайшем обновлении.');
      return;
    }
    try {
      await Linking.openURL(whatsappUrl('Здравствуйте! Хочу подключить свой салон к BookSpot.', PARTNER_WHATSAPP));
    } catch {
      Alert.alert('WhatsApp не открылся', 'Проверьте, что WhatsApp установлен.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Стать партнёром</Text>
      <Text style={styles.subtitle}>Подключите свой салон к BookSpot. Напишите нам в WhatsApp — расскажем о подписке и за пару минут создадим аккаунт для вашего салона.</Text>

      <View style={styles.points}>
        {POINTS.map(({ Icon, text }) => (
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
        <Text style={styles.buttonText}>Написать в WhatsApp</Text>
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
