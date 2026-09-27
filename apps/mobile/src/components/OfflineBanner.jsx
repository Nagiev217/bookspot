// Тонкая полоса сверху экрана при потере сети — раньше при обрыве связи
// пользователь просто видел сырой текст ошибки Supabase на месте контента
// без какого-либо объяснения. NetInfo слушает реальное состояние сети
// (не просто состояние запроса), поэтому баннер появляется даже там, где
// пользователь ещё не успел ничего нажать.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { COLORS, SPACING, FONT, TEXT_SIZE } from '@/theme/tokens';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isConnected === null — статус ещё не определён (первый тик) —
      // не считаем это офлайном, чтобы баннер не мигал при каждом старте.
      setOffline(state.isConnected === false);
    });
    return unsubscribe;
  }, []);

  if (!offline) return null;

  return (
    <View style={styles.banner}>
      <WifiOff size={14} color={COLORS.white} />
      <Text style={styles.text}>Нет подключения к интернету</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 52,
    paddingBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.danger,
    zIndex: 1000,
  },
  text: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
});
