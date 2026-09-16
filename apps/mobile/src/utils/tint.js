// Стабильный псевдослучайный тинт-плейсхолдер для фото салона/мастера, пока
// нет реальных изображений (business.logo_url и т.п. — Фаза 2). Хэшируем
// uuid в индекс палитры, чтобы один и тот же бизнес всегда получал один и
// тот же цвет между перерисовками (не меняется при каждом ре-рендере, как
// было бы с Math.random()).
export const TINTS = [
  ['#E3E7F5', '#CFD6EA'],
  ['#E8E6F0', '#D5D2E6'],
  ['#E2E9F0', '#CBD6E2'],
  ['#EDE9E6', '#DCD5CF'],
  ['#E6ECEA', '#CFDAD6'],
  ['#EAE7EE', '#D6D1DF'],
];

export function tintFor(id) {
  if (!id) return TINTS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}
