// Переводы интерфейса: азербайджанский, русский, английский.
//
// t('ключ', {параметры}) — обычная функция, а не хук: её можно звать и в
// разметке, и в обработчиках, и в утилитах. Чтобы экраны перерисовались при
// смене языка, корневой _layout.jsx перемонтирует навигацию по ключу языка
// (useLang ниже) — поэтому значения, вычисленные на уровне модуля, сюда
// класть нельзя: только внутри функций/компонентов.
//
// Язык по умолчанию — язык телефона (az/ru/en), иначе английский. Выбор
// сохраняется на устройстве и в profiles.lang: по нему сервер выбирает язык
// push-уведомлений (0031).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import ru from './locales/ru';
import az from './locales/az';
import en from './locales/en';

const DICTS = { ru, az, en };
const STORAGE_KEY = 'bookspot:lang';

export const LANGUAGES = [
  { code: 'az', label: 'Azərbaycan dili' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
];

function deviceLang() {
  try {
    const code = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2).toLowerCase();
    return DICTS[code] ? code : 'en';
  } catch {
    return 'en';
  }
}

let current = deviceLang();

export const useLang = create(() => ({ lang: current, ready: false }));

export function getLang() {
  return current;
}

export function t(key, params) {
  const s = DICTS[current][key] ?? DICTS.ru[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined || params[k] === null ? m : String(params[k])));
}

// Склонение по числу. В словаре значение — объект форм:
//   ru: { one, few, many }  (1 отзыв / 2 отзыва / 5 отзывов)
//   en: { one, other }
//   az: строка — существительное после числа не меняется (1 rəy, 5 rəy).
// В формах можно использовать {n}.
export function tn(key, n, params) {
  const v = DICTS[current][key] ?? DICTS.ru[key];
  let form = v;
  if (v && typeof v === 'object') {
    if (current === 'ru') {
      const m10 = n % 10;
      const m100 = n % 100;
      form = m10 === 1 && m100 !== 11 ? v.one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? v.few : v.many;
    } else {
      form = n === 1 ? v.one : v.other;
    }
  }
  const s = typeof form === 'string' ? form : key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k === 'n' ? String(n) : params?.[k] ?? m));
}

// Название категории из таблицы categories (name_az/name_ru/name_en).
export function categoryName(c) {
  return (c && (c[`name_${current}`] || c.name_ru || c.name_en)) || '';
}

// Читает сохранённый выбор до первого рендера (_layout.jsx ждёт ready).
export async function loadSavedLang() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && DICTS[saved]) current = saved;
  } catch {}
  useLang.setState({ lang: current, ready: true });
}

// Экран, на который вернуть пользователя после перемонтирования навигации
// (_layout.jsx забирает его один раз через takeReturnRoute).
let returnRoute = null;
export function takeReturnRoute() {
  const r = returnRoute;
  returnRoute = null;
  return r;
}

// onSaved — запись языка в профиль (profile.js), если пользователь вошёл.
// returnTo — путь текущего экрана, например '/(client-tabs)/profile'.
export async function setLang(code, onSaved, returnTo) {
  if (!DICTS[code] || code === current) return;
  current = code;
  returnRoute = returnTo ?? null;
  useLang.setState({ lang: code });
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {}
  onSaved?.(code);
}
