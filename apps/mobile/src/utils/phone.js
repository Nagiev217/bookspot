// Телефон клиента: салону нужен, чтобы позвонить по заявке.
// Принимаем, как набирают в Азербайджане: 050 123 45 67, 50 123 45 67,
// +994 50 123 45 67 — и храним всегда как +994501234567. Иностранные номера
// с «+» и кодом страны принимаем как есть.
export function normalizePhone(input) {
  const raw = String(input || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return digits.length >= 9 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.startsWith('994') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+994${digits.slice(1)}`;
  if (digits.length === 9) return `+994${digits}`;
  return null;
}

// +994501234567 → +994 50 123 45 67
export function formatPhone(phone) {
  const m = /^\+994(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone || '');
  return m ? `+994 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone || '';
}
