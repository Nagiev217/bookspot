// Недавно просмотренные салоны — на устройстве (AsyncStorage), до 10 штук,
// последний открытый первым. Это удобство, а не данные аккаунта: при
// недоступном хранилище просто ничего не показываем.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'bookspot:recentSalons';
const MAX = 10;

export async function getRecentSalons() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export async function addRecentSalon(id) {
  if (!id) return;
  try {
    const ids = (await getRecentSalons()).filter((x) => x !== id);
    await AsyncStorage.setItem(KEY, JSON.stringify([id, ...ids].slice(0, MAX)));
  } catch {}
}
