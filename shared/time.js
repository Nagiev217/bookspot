// Единственное место, где происходит конвертация времени. Азербайджан —
// UTC+4 без перехода на летнее время (отменён в 2016), поэтому смещение
// фиксированное и не требует библиотеки часовых поясов.
'use strict';

const BAKU_OFFSET_MIN = 240;

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// "14:30" -> 870 (минуты от полуночи)
function toMin(hhmm) {
  const m = HHMM_RE.exec(hhmm);
  if (!m) throw new RangeError(`Неверный формат времени: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

// 870 -> "14:30"
function toHHMM(min) {
  if (!Number.isInteger(min) || min < 0 || min >= 24 * 60) {
    throw new RangeError(`Минуты вне диапазона суток: ${min}`);
  }
  const h = String(Math.floor(min / 60)).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// { date: "2026-09-20", minutes: 870 } (Баку-локальное) -> Date (UTC)
function toUtcTimestamp(date, minutes) {
  if (!DATE_RE.test(date)) throw new RangeError(`Неверный формат даты: ${date}`);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 0, minutes, 0) - BAKU_OFFSET_MIN * 60000);
}

module.exports = { BAKU_OFFSET_MIN, HHMM_RE, DATE_RE, toMin, toHHMM, toUtcTimestamp };
