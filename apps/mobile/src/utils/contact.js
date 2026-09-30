// Номер WhatsApp для партнёров (салоны пишут сюда, чтобы подключиться и
// оплатить подписку). Международный формат без «+» и пробелов, например
// '994501234567'. Пока номер не задан — кнопки WhatsApp показывают подсказку.
export const PARTNER_WHATSAPP = 'ЗАПОЛНИТЬ';

export const hasPartnerWhatsapp = () => /^\d{8,15}$/.test(PARTNER_WHATSAPP);

// Ссылка wa.me: с номером — прямо в чат, без номера — выбор контакта.
export function whatsappUrl(text, phone = null) {
  const digits = phone ? String(phone).replace(/\D/g, '') : '';
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}
