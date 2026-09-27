// Большинство RPC (create_booking, reschedule_booking, ...) уже сами
// поднимают исключения на русском ("Этот слот уже занят", "Требуется
// авторизация" — см. supabase/migrations/0016_schedule_validation.sql), их
// e.message можно показывать как есть. Эта функция нужна для двух случаев,
// которые сами по себе НЕ приходят по-русски: обрыв сети (supabase-js/fetch
// кидают технический английский текст) и голые Postgres-коды без
// собственного человеческого текста в исключении.
const NETWORK_PATTERNS = ['network request failed', 'failed to fetch', 'fetch failed', 'load failed'];

const CODE_MESSAGES = {
  '23P01': 'Этот слот уже занят — выберите другое время',
  '23505': 'Такая запись уже существует',
  '28000': 'Требуется авторизация — войдите ещё раз',
  PGRST301: 'Сессия истекла — войдите ещё раз',
};

export function friendlyError(e, fallback = 'Что-то пошло не так. Попробуйте ещё раз') {
  if (!e) return fallback;

  const message = typeof e.message === 'string' ? e.message : '';
  const lower = message.toLowerCase();
  if (NETWORK_PATTERNS.some((p) => lower.includes(p))) {
    return 'Нет подключения к интернету. Проверьте сеть и попробуйте снова';
  }

  if (e.code && CODE_MESSAGES[e.code]) return CODE_MESSAGES[e.code];

  // RPC-исключения в этом проекте (see raise exception '...' в миграциях)
  // уже написаны по-русски и понятны пользователю как есть.
  if (message) return message;

  return fallback;
}
