// Кэш роли/режима, помеченный uid — чтобы данные предыдущего аккаунта не
// протекли в интерфейс нового при быстром signOut→signIn на одном
// устройстве (та же защита, что и в dersreport77's roleCache.js).
import AsyncStorage from '@react-native-async-storage/async-storage';

const roleKey = (uid) => `bookspot:role:${uid}`;
const modeKey = (uid) => `bookspot:mode:${uid}`;

export async function getCachedRole(uid) {
  try {
    const raw = await AsyncStorage.getItem(roleKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedRole(uid, role, businessId) {
  try {
    await AsyncStorage.setItem(roleKey(uid), JSON.stringify({ role, businessId }));
  } catch {
    // AsyncStorage недоступен — не критично, роль перечитается с сервера.
  }
}

export async function getCachedMode(uid, fallback) {
  try {
    const raw = await AsyncStorage.getItem(modeKey(uid));
    return raw === 'client' || raw === 'business' ? raw : fallback;
  } catch {
    return fallback;
  }
}

export async function setCachedMode(uid, mode) {
  try {
    await AsyncStorage.setItem(modeKey(uid), mode);
  } catch {
    // не критично
  }
}
