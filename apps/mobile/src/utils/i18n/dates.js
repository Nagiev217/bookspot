// Дни недели и месяцы на текущем языке. Индексы как у Date: день 0 = воскресенье,
// месяц 0 = январь. Функции, а не константы: язык может смениться на лету.
import { getLang } from './index';

const DOW_SHORT = {
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  az: ['B', 'B.e', 'Ç.a', 'Ç', 'C.a', 'C', 'Ş'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const DOW_FULL = {
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  az: ['Bazar', 'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
// Родительный падеж для «5 сентября»; в az/en форма та же.
const MONTHS = {
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  az: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const MONTHS_SHORT = {
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  az: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export const dowShort = (i) => DOW_SHORT[getLang()][i];
export const dowFull = (i) => DOW_FULL[getLang()][i];
export const monthName = (i) => MONTHS[getLang()][i];
export const monthShort = (i) => MONTHS_SHORT[getLang()][i];

// «5 сентября» / «5 sentyabr» / «September 5».
export function dayMonth(day, monthIndex) {
  return getLang() === 'en' ? `${monthName(monthIndex)} ${day}` : `${day} ${monthName(monthIndex)}`;
}
export function dayMonthShort(day, monthIndex) {
  return getLang() === 'en' ? `${monthShort(monthIndex)} ${day}` : `${day} ${monthShort(monthIndex)}`;
}
