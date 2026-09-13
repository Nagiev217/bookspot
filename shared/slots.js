// Чистый алгоритм генерации слотов. Никаких обращений к Firestore — только
// числа и массивы. Это единственное место, где живёт логика "когда мастер
// свободен", и она же используется и для показа (getAvailability), и для
// проверки при записи (createBooking) — поэтому у клиента и сервера никогда
// не может разойтись мнение о том, свободен слот или нет.
'use strict';

const { toHHMM } = require('./time');

// Все интервалы — { start, end } в минутах от полуночи (0..1440), start < end.

function assertInterval({ start, end }) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new RangeError('start/end должны быть целыми минутами');
  }
  if (start < 0 || end > 24 * 60) {
    throw new RangeError('интервал выходит за пределы суток — ночные смены не поддерживаются');
  }
  if (start >= end) {
    throw new RangeError(`пустой или обратный интервал: ${start}-${end}`);
  }
}

// Рабочие часы дня с учётом исключения. weeklyIntervals — интервалы обычного
// дня недели, exception — { type: 'day_off' | 'custom_hours', intervals? }.
function buildWorkIntervals(weeklyIntervals, exception) {
  if (exception?.type === 'day_off') return [];
  if (exception?.type === 'custom_hours') {
    const intervals = exception.intervals ?? [];
    intervals.forEach(assertInterval);
    return normalize(intervals);
  }
  const intervals = weeklyIntervals ?? [];
  intervals.forEach(assertInterval);
  return normalize(intervals);
}

// Сливает пересекающиеся/смежные интервалы и сортирует по началу.
function normalize(intervals) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

// free = intervals \ busy. Оба списка не обязаны быть отсортированы заранее.
function subtract(intervals, busy) {
  let free = normalize(intervals);
  const busySorted = normalize(busy);
  for (const b of busySorted) {
    const next = [];
    for (const f of free) {
      if (b.end <= f.start || b.start >= f.end) {
        // не пересекаются
        next.push(f);
        continue;
      }
      if (b.start > f.start) next.push({ start: f.start, end: Math.min(b.start, f.end) });
      if (b.end < f.end) next.push({ start: Math.max(b.end, f.start), end: f.end });
    }
    free = next.filter((iv) => iv.start < iv.end);
  }
  return free;
}

// Возвращает список начал слотов "HH:mm" на сетке stepMin, каждый из которых
// вмещает durationMin + bufferMin (буфер расходуется после услуги, до
// следующей записи) внутри свободного окна.
// ponytail: буфер расширяет занятые интервалы только "вперёд" (после
// существующей брони); если понадобится буфер и перед бронью — расширять
// busy симметрично здесь же, в одном месте.
function computeSlots({ work, busy, durationMin, bufferMin = 0, stepMin = 15 }) {
  if (!Number.isInteger(durationMin) || durationMin <= 0) {
    throw new RangeError('durationMin должен быть положительным целым');
  }
  if (!Number.isInteger(stepMin) || stepMin <= 0) {
    throw new RangeError('stepMin должен быть положительным целым');
  }
  const expandedBusy = normalize(busy).map((b) => ({ start: b.start, end: b.end + bufferMin }));
  const free = subtract(work, expandedBusy);

  const slots = [];
  for (const iv of free) {
    let s = Math.ceil(iv.start / stepMin) * stepMin;
    for (; s + durationMin <= iv.end; s += stepMin) {
      slots.push(toHHMM(s));
    }
  }
  return slots;
}

// Ищет интервал из occupied, пересекающийся с [start, end). Возвращает его
// bookingId или null. Используется createBooking внутри транзакции как
// последняя проверка перед записью — источник истины, а не computeSlots.
function findConflict(occupied, start, end) {
  for (const iv of occupied) {
    if (start < iv.end && end > iv.start) return iv.bookingId ?? null;
  }
  return null;
}

module.exports = { buildWorkIntervals, normalize, subtract, computeSlots, findConflict };
