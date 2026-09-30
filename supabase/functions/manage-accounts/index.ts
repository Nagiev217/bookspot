// Управление аккаунтами: создание салона с владельцем (admin), выдача и
// отзыв доступа мастерам (владелец), сброс временного пароля.
//
// Создать пользователя в Supabase Auth и сменить ему пароль можно только
// ключом service_role — из приложения нельзя, поэтому всё здесь. Функция
// вызывается с JWT пользователя (supabase.functions.invoke подставляет его
// сам): по нему определяем, кто зовёт, и проверяем права в коде ниже.
// Сами изменения в базе — через SECURITY DEFINER RPC из 0022
// (admin_create_business, link_staff), выданные только service_role.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// 10 символов без похожих (0/O, 1/l/I) — пароль будут перепечатывать из WhatsApp.
function tempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const cleanEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    // Кто вызывает
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) throw new HttpError(401, 'Требуется авторизация');
    const callerId = userData.user.id;
    const { data: caller } = await admin.from('profiles').select('role, business_id').eq('id', callerId).single();
    if (!caller) throw new HttpError(401, 'Профиль не найден');

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    const requireAdmin = () => {
      if (caller.role !== 'admin') throw new HttpError(403, 'Только для администратора');
    };
    // Владелец конкретного салона — по businesses.owner_id, как в 0022.
    const requireOwnerOf = async (businessId: string) => {
      const { data } = await admin.from('businesses').select('owner_id').eq('id', businessId).maybeSingle();
      if (!data || data.owner_id !== callerId) throw new HttpError(403, 'Только владелец салона');
    };

    const createAuthUser = async (email: string, name: string, phone: string | null) => {
      if (!isEmail(email)) throw new HttpError(400, 'Некорректный email');
      const password = tempPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone, lang: 'ru' },
      });
      if (error) {
        const msg = /already|registered|exists/i.test(error.message) ? 'Пользователь с таким email уже есть' : error.message;
        throw new HttpError(400, msg);
      }
      return { userId: data.user!.id, password };
    };

    switch (action) {
      // ── admin: новый салон + аккаунт владельца ─────────────────────────
      case 'create_business_with_owner': {
        requireAdmin();
        const b = body.business ?? {};
        const o = body.owner ?? {};
        const email = cleanEmail(o.email);
        const ownerName = String(o.name ?? '').trim();
        if (!ownerName) throw new HttpError(400, 'Укажите имя владельца');

        const { userId, password } = await createAuthUser(email, ownerName, o.phone ?? null);
        const { data: businessId, error } = await admin.rpc('admin_create_business', {
          p_owner_id: userId,
          p_name: b.name,
          p_category_id: b.categoryId,
          p_city: b.city,
          p_district: b.district ?? null,
          p_address: b.address ?? null,
          p_phone: b.phone ?? null,
          p_paid_until: b.paidUntil ?? null,
        });
        if (error) {
          // Салон не создался — не оставляем «висящий» аккаунт без салона.
          await admin.auth.admin.deleteUser(userId);
          throw new HttpError(400, error.message);
        }
        return json({ businessId, email, password });
      }

      // ── владелец: выдать мастеру логин ─────────────────────────────────
      case 'create_staff': {
        const { businessId, masterId } = body;
        await requireOwnerOf(businessId);
        const { data: master } = await admin.from('masters').select('name, user_id, business_id').eq('id', masterId).maybeSingle();
        if (!master || master.business_id !== businessId) throw new HttpError(404, 'Мастер не найден');
        if (master.user_id) throw new HttpError(400, 'У этого мастера уже есть доступ');

        const email = cleanEmail(body.email);
        const { userId, password } = await createAuthUser(email, master.name, body.phone ?? null);
        const { error } = await admin.rpc('link_staff', { p_business_id: businessId, p_user_id: userId, p_master_id: masterId });
        if (error) {
          await admin.auth.admin.deleteUser(userId);
          throw new HttpError(400, error.message);
        }
        return json({ email, password });
      }

      // ── сброс пароля: admin — владельцу, владелец — своему мастеру ─────
      case 'reset_password': {
        const targetId = String(body.userId ?? '');
        const { data: target } = await admin.from('profiles').select('role, business_id').eq('id', targetId).maybeSingle();
        if (!target) throw new HttpError(404, 'Пользователь не найден');
        if (caller.role === 'admin' && target.role === 'business_owner') {
          // ok
        } else if (target.role === 'staff' && target.business_id) {
          await requireOwnerOf(target.business_id);
        } else {
          throw new HttpError(403, 'Нет прав на сброс пароля этому пользователю');
        }
        const password = tempPassword();
        const { data: u, error } = await admin.auth.admin.updateUserById(targetId, { password });
        if (error) throw new HttpError(400, error.message);
        await admin.from('profiles').update({ must_change_password: true }).eq('id', targetId);
        return json({ email: u.user?.email, password });
      }

      // ── владелец: забрать доступ у мастера ─────────────────────────────
      case 'remove_staff': {
        const { masterId } = body;
        const { data: master } = await admin.from('masters').select('business_id, user_id').eq('id', masterId).maybeSingle();
        if (!master) throw new HttpError(404, 'Мастер не найден');
        await requireOwnerOf(master.business_id);
        if (!master.user_id) return json({ ok: true });

        const staffId = master.user_id;
        await admin.from('masters').update({ user_id: null }).eq('id', masterId);
        // Как в delete_my_account: брони, где мастер записывался клиентом,
        // обезличиваются, а не удаляются (FK без каскада).
        await admin.from('bookings').update({ client_id: null, client_name: 'Удалённый пользователь', client_phone: null }).eq('client_id', staffId);
        await admin.from('reviews').update({ client_id: null, client_name: 'Удалённый пользователь' }).eq('client_id', staffId);
        const { error } = await admin.auth.admin.deleteUser(staffId);
        if (error) throw new HttpError(400, error.message);
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, 'Неизвестное действие');
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: (e as Error).message ?? 'Ошибка сервера' }, 500);
  }
});
