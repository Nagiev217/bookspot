// Минимальная обязательная автопроверка ядра бронирования. Обычный
// node:assert, без фреймворка, без эмулятора, без сети — запускается
// `node functions/slots.test.js` и должен быть зелёным перед любой правкой
// slots.js.
'use strict';

const assert = require('node:assert/strict');
const { buildWorkIntervals, subtract, computeSlots, findConflict } = require('./slots');
const { toMin, toHHMM } = require('./time');

let count = 0;
function check(name, fn) {
  fn();
  count += 1;
}

// --- toMin/toHHMM ---
check('toMin/toHHMM round-trip', () => {
  assert.equal(toMin('09:00'), 540);
  assert.equal(toMin('23:59'), 1439);
  assert.equal(toHHMM(540), '09:00');
  assert.equal(toHHMM(0), '00:00');
});

check('toMin отклоняет неверный формат', () => {
  assert.throws(() => toMin('9:00'));
  assert.throws(() => toMin('24:00'));
  assert.throws(() => toMin('12:60'));
});

// --- buildWorkIntervals ---
check('day_off даёт пустой рабочий день', () => {
  const work = buildWorkIntervals([{ start: 600, end: 1140 }], { type: 'day_off' });
  assert.deepEqual(work, []);
});

check('custom_hours переопределяет обычное расписание', () => {
  const work = buildWorkIntervals([{ start: 600, end: 1140 }], {
    type: 'custom_hours',
    intervals: [{ start: 660, end: 900 }],
  });
  assert.deepEqual(work, [{ start: 660, end: 900 }]);
});

check('без исключения используется недельное расписание', () => {
  const work = buildWorkIntervals([{ start: 600, end: 1140 }], null);
  assert.deepEqual(work, [{ start: 600, end: 1140 }]);
});

check('пустые рабочие часы -> пустой день', () => {
  const work = buildWorkIntervals([], null);
  assert.deepEqual(work, []);
  assert.deepEqual(computeSlots({ work, busy: [], durationMin: 30 }), []);
});

check('ночная смена (end > 1440) отклоняется', () => {
  assert.throws(() => buildWorkIntervals([{ start: 1380, end: 1500 }], null));
});

// --- subtract ---
check('обед разрывает рабочий день на два окна', () => {
  const work = [{ start: 600, end: 1140 }]; // 10:00-19:00
  const lunch = [{ start: 780, end: 840 }]; // 13:00-14:00
  assert.deepEqual(subtract(work, lunch), [
    { start: 600, end: 780 },
    { start: 840, end: 1140 },
  ]);
});

check('исключение гасит весь день', () => {
  const work = buildWorkIntervals([{ start: 600, end: 1140 }], { type: 'day_off' });
  assert.deepEqual(subtract(work, []), []);
});

// --- computeSlots ---
check('45-минутная услуга на сетке 15 минут', () => {
  const work = [{ start: 600, end: 690 }]; // 10:00-11:30, 90 минут
  const slots = computeSlots({ work, busy: [], durationMin: 45, stepMin: 15 });
  // помещается 10:00-10:45 и 10:15-11:00 и 10:30-11:15 и 10:45-11:30
  assert.deepEqual(slots, ['10:00', '10:15', '10:30', '10:45']);
});

check('услуга не помещается до закрытия', () => {
  const work = [{ start: 600, end: 630 }]; // всего 30 минут
  const slots = computeSlots({ work, busy: [], durationMin: 45, stepMin: 15 });
  assert.deepEqual(slots, []);
});

check('буфер съедает последний слот', () => {
  const work = [{ start: 600, end: 660 }]; // 10:00-11:00
  const withoutBuffer = computeSlots({ work, busy: [], durationMin: 30, bufferMin: 0, stepMin: 15 });
  assert.deepEqual(withoutBuffer, ['10:00', '10:15', '10:30']);
  // существующая бронь 10:00-10:30 + буфер 15 минут после -> занято до 10:45
  const busy = [{ start: 600, end: 630, bookingId: 'b1' }];
  const withBuffer = computeSlots({ work, busy, durationMin: 30, bufferMin: 15, stepMin: 15 });
  assert.deepEqual(withBuffer, []); // 10:45-11:15 не помещается до 11:00
});

check('обед разрывает день слотов', () => {
  const work = subtract([{ start: 600, end: 1140 }], [{ start: 780, end: 840 }]);
  const slots = computeSlots({ work, busy: [], durationMin: 60, stepMin: 30 });
  assert.ok(slots.includes('12:00')); // последний слот до обеда (12:00-13:00)
  assert.ok(!slots.some((s) => toMin(s) < 840 && toMin(s) + 60 > 780));
  assert.ok(slots.includes('14:00')); // первый слот после обеда
});

// --- findConflict ---
check('бронь впритык к соседней разрешена', () => {
  const occupied = [{ start: 600, end: 660, bookingId: 'a' }]; // 10:00-11:00
  assert.equal(findConflict(occupied, 660, 720), null); // 11:00-12:00 — стык, не пересечение
  assert.equal(findConflict(occupied, 540, 600), null); // 09:00-10:00 — стык с другой стороны
});

check('пересечение на 1 минуту с каждого края отклоняется', () => {
  const occupied = [{ start: 600, end: 660, bookingId: 'a' }]; // 10:00-11:00
  assert.equal(findConflict(occupied, 659, 719), 'a'); // залезает на 1 минуту слева
  assert.equal(findConflict(occupied, 541, 601), 'a'); // залезает на 1 минуту справа
});

check('findConflict возвращает null для пустого списка', () => {
  assert.equal(findConflict([], 600, 660), null);
});

console.log(`${count} assertions OK`);
