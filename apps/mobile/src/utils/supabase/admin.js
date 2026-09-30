// Аккаунты и подписка. Всё, что создаёт пользователей или меняет пароли,
// идёт через Edge Function manage-accounts (там service_role); подписка и
// блокировка — через admin-RPC из 0022, которые сами проверяют роль.
import { supabase } from './config';

// supabase.functions.invoke на не-2xx кладёт тело ответа в error.context —
// достаём оттуда понятный русский текст, который вернула функция.
async function callAccounts(payload) {
  const { data, error } = await supabase.functions.invoke('manage-accounts', { body: payload });
  if (error) {
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // тело не JSON — оставляем исходное сообщение
    }
    throw new Error(message);
  }
  return data;
}

// ── admin ────────────────────────────────────────────────────────────────

export function createBusinessWithOwner({ business, owner }) {
  return callAccounts({ action: 'create_business_with_owner', business, owner });
}

export async function listAllBusinessesAdmin() {
  const { data, error } = await supabase.rpc('admin_list_businesses');
  if (error) throw error;
  return data;
}

export async function setSubscription(businessId, paidUntil) {
  const { error } = await supabase.rpc('admin_set_subscription', { p_business_id: businessId, p_paid_until: paidUntil });
  if (error) throw error;
}

export async function setBusinessStatus(businessId, status) {
  const { error } = await supabase.rpc('admin_set_business_status', { p_business_id: businessId, p_status: status });
  if (error) throw error;
}

// ── владелец: доступ мастеров ────────────────────────────────────────────

export function grantStaffAccess({ businessId, masterId, email }) {
  return callAccounts({ action: 'create_staff', businessId, masterId, email });
}

export function revokeStaffAccess(masterId) {
  return callAccounts({ action: 'remove_staff', masterId });
}

// admin — владельцу, владелец — своему мастеру (права проверяет функция).
export function resetPassword(userId) {
  return callAccounts({ action: 'reset_password', userId });
}

// ── подписка ─────────────────────────────────────────────────────────────

// Баку, UTC+4 без перехода на летнее время — как во всём приложении.
export function bakuTodayISO() {
  return new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
}

export function addMonthsISO(iso, months) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function daysLeft(paidUntil) {
  if (!paidUntil) return null;
  const ms = new Date(`${paidUntil}T00:00:00Z`) - new Date(`${bakuTodayISO()}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

// { label, tone } для бейджа подписки: tone = 'ok' | 'warn' | 'off'.
export function subscriptionBadge({ status, paid_until: paidUntil }) {
  if (status === 'blocked') return { label: 'Заблокирован', tone: 'off' };
  if (!paidUntil) return { label: 'Без подписки', tone: 'ok' };
  const left = daysLeft(paidUntil);
  const date = formatDateRu(paidUntil);
  if (left < 0) return { label: `Истекла ${date}`, tone: 'off' };
  if (left <= 5) return { label: `До ${date} · осталось ${left} дн.`, tone: 'warn' };
  return { label: `Активна до ${date}`, tone: 'ok' };
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export function formatDateRu(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
