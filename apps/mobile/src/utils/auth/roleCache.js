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

export async function setCachedRole(uid, role, businessId, masterId = null) {
  try {
    await AsyncStorage.setItem(roleKey(uid), JSON.stringify({ role, businessId, masterId }));
  } catch {
    // AsyncStorage недоступен — не критично, роль перечитается с сервера.
  }
}

// Какие режимы (навигационные графы) доступны роли. Первый — режим по
// умолчанию: admin открывает админку, владелец и мастер — бизнес-режим.
function modesFor(role) {
  switch (role) {
    case 'admin':
      return ['admin', 'client'];
    case 'business_owner':
    case 'staff':
      return ['business', 'client'];
    default:
      return ['client'];
  }
}

export function defaultModeFor(role) {
  return modesFor(role)[0];
}

// Последний выбранный режим, если он всё ещё доступен роли; иначе — по
// умолчанию (например, владельца лишили бизнеса — кэш 'business' устарел).
export async function resolveMode(uid, role) {
  try {
    const raw = await AsyncStorage.getItem(modeKey(uid));
    return modesFor(role).includes(raw) ? raw : defaultModeFor(role);
  } catch {
    return defaultModeFor(role);
  }
}

export async function setCachedMode(uid, mode) {
  try {
    await AsyncStorage.setItem(modeKey(uid), mode);
  } catch {
    // не критично
  }
}
