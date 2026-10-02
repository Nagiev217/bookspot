// Понятный пользователю текст ошибки на языке интерфейса.
//
// Сервер (RPC в миграциях и Edge Function manage-accounts) поднимает
// исключения по-русски. Здесь каждое такое сообщение сопоставлено с ключом
// перевода: SERVER_MESSAGES — точные тексты, SERVER_PATTERNS — тексты с
// подстановкой (число часов, список пунктов). Новое исключение на сервере =
// новая строка здесь и ключ server.* во всех трёх словарях.
//
// Обрыв сети приходит от supabase-js/fetch техническим английским текстом,
// голые Postgres-коды — без человеческого текста; для них свои ветки.
import { t, getLang } from '@/utils/i18n';

const NETWORK_PATTERNS = ['network request failed', 'failed to fetch', 'fetch failed', 'load failed'];

const CODE_KEYS = {
  '23P01': 'server.slotTaken',
  '23505': 'errors.duplicate',
  '28000': 'errors.authRequired',
  PGRST301: 'errors.sessionExpired',
};

const SERVER_MESSAGES = {
  'Бронь не найдена': 'server.bookingNotFound',
  'Запись не найдена': 'server.bookingNotFound',
  'Заявка не найдена': 'server.requestNotFound',
  'Визит ещё не наступил': 'server.visitNotStarted',
  'Время заявки уже прошло': 'server.requestTimePassed',
  'Вы не сотрудник этого бизнеса': 'server.noAccess',
  'Нет доступа к записи к этому мастеру': 'server.noAccess',
  'Нет доступа к этой брони': 'server.noAccess',
  'Нет доступа к этой записи': 'server.noAccess',
  'Нет доступа к этому салону': 'server.noAccess',
  'Только для администратора': 'server.noAccess',
  'Только владелец салона': 'server.ownerOnly',
  'Опубликовать салон может только владелец': 'server.ownerOnly',
  'Ответить на заявку может только мастер или владелец салона': 'server.staffOnly',
  'Вы уже оставили отзыв на этот визит': 'server.reviewExists',
  'Отзыв можно оставить только после завершённого визита': 'server.reviewAfterVisit',
  'Оценка должна быть от 1 до 5': 'server.ratingRange',
  'Вы уже предложили другое время — ждём ответа клиента': 'server.alreadyProposed',
  'Другое время можно предложить только на новую заявку': 'server.proposeOnlyPending',
  'Заявка уже закрыта': 'server.requestClosed',
  'Предложение уже неактуально': 'server.proposalStale',
  'Предложенное время уже прошло': 'server.proposalTimePassed',
  'Это то же самое время — просто примите заявку': 'server.sameTime',
  'Мастер не найден': 'server.masterNotFound',
  'Мастер не найден в этом бизнесе': 'server.masterNotFound',
  'Профиль мастера не найден': 'server.masterNotFound',
  'Услуга не найдена в этом бизнесе': 'server.serviceNotFound',
  'Этот мастер не выполняет выбранную услугу': 'server.masterNoService',
  'Этот мастер не работает в выбранное время': 'server.masterNotWorking',
  'Нельзя записаться на прошедшее время': 'server.pastTime',
  'Салон временно не принимает записи': 'server.salonClosed',
  'Салон не найден': 'server.salonNotFound',
  'Неверный формат времени': 'server.badTime',
  'Можно загрузить не больше 5 фото': 'server.maxPhotos',
  'Недопустимая ссылка на фото': 'server.badPhoto',
  'О себе — не больше 500 символов': 'server.bioTooLong',
  'Специализация — не больше 40 символов': 'server.specialtyTooLong',
  'Опыт — от 0 до 70 лет': 'server.experienceRange',
  'Укажите имя клиента': 'server.clientNameRequired',
  'Укажите имя владельца': 'server.ownerNameRequired',
  'Некорректное название': 'server.badName',
  'Не указан город': 'server.cityRequired',
  'Некорректный email': 'server.badEmail',
  'У вас уже есть бизнес': 'server.alreadyHasBusiness',
  'У этого пользователя уже есть бизнес': 'server.alreadyHasBusiness',
  'У этого мастера уже есть доступ': 'server.masterHasAccess',
  'Нет прав на сброс пароля этому пользователю': 'server.noResetRights',
  'Пользователь не найден': 'server.userNotFound',
  'Профиль не найден': 'server.userNotFound',
  'Требуется авторизация': 'errors.authRequired',
  'Эту бронь уже нельзя отменить': 'server.cannotCancel',
  'Эту бронь уже нельзя перенести': 'server.cannotReschedule',
  'Это время уже занято — выберите другое': 'server.slotTaken',
  'Этот слот уже занят — выберите другое время': 'server.slotTaken',
  'Этот слот уже занят — обновите доступное время': 'server.slotTaken',
  'У вас уже 3 активные записи в этом салоне — дождитесь визита или отмените одну': 'server.tooManyBookings',
  'Сначала отвяжите или передайте свой бизнес — аккаунт владельца активного салона нельзя удалить напрямую':
    'server.ownerCannotDelete',
};

// Пункты чек-листа из publish_business (0025).
const SETUP_ITEMS = {
  'описание (от 30 символов)': 'server.setup.description',
  'фото салона': 'server.setup.photos',
  'мастера': 'server.setup.masters',
  'расписание мастера': 'server.setup.schedule',
  'услуги с мастером': 'server.setup.services',
};

const SERVER_PATTERNS = [
  [/^Отменить можно не позднее чем за (\d+) ч\./, (m) => t('server.cancelWindow', { hours: m[1] })],
  [/^Перенести можно не позднее чем за (\d+) ч\./, (m) => t('server.rescheduleWindow', { hours: m[1] })],
  [/^Эту бронь нельзя завершить/, () => t('server.cannotComplete')],
  [
    /^Чтобы опубликовать салон, добавьте: (.+)$/,
    (m) =>
      t('server.publishMissing', {
        items: m[1]
          .split(', ')
          .map((x) => (SETUP_ITEMS[x] ? t(SETUP_ITEMS[x]) : x))
          .join(', '),
      }),
  ],
];

export function friendlyError(e, fallback) {
  const fb = fallback ?? t('errors.generic');
  if (!e) return fb;

  const message = typeof e.message === 'string' ? e.message.trim() : '';
  if (NETWORK_PATTERNS.some((p) => message.toLowerCase().includes(p))) return t('errors.network');

  if (SERVER_MESSAGES[message]) return t(SERVER_MESSAGES[message]);
  for (const [re, fmt] of SERVER_PATTERNS) {
    const m = message.match(re);
    if (m) return fmt(m);
  }
  if (e.code && CODE_KEYS[e.code]) return t(CODE_KEYS[e.code]);

  // Непереведённый русский текст сервера показываем как есть только в
  // русском интерфейсе; в остальных — общий текст из места вызова.
  if (message && /[А-Яа-яЁё]/.test(message)) return getLang() === 'ru' ? message : fb;
  return fb;
}
