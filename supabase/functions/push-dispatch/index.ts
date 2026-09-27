// Дёргается pg_cron раз в минуту (0018_push_outbox.sql) через service_role
// Bearer-токен из Vault — поэтому auth проверяется штатным JWT-механизмом
// Supabase Functions, отдельный --no-verify-jwt не нужен и не используется:
// это привело бы к тому, что URL функции сам по себе становился бы способом
// произвольно форсировать досрочную рассылку.
//
// Логика простая и специально без ретраев с backoff: attempts просто
// считает попытки, строка с attempts >= 5 больше не выбирается — если Expo
// Push API стабильно роняет одну и ту же отправку, разбираться в этом
// вручную дешевле, чем городить очередь повторов на пустом месте.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BATCH_SIZE = 50;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: rows, error } = await supabase
    .from('notification_outbox')
    .select('id, user_id, booking_id, type, title, body, data, attempts')
    .is('sent_at', null)
    .lte('send_after', new Date().toISOString())
    .lt('attempts', 5)
    .order('send_after')
    .limit(BATCH_SIZE);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, fcm_token').in('id', userIds);
  const tokenByUser = new Map((profiles ?? []).map((p) => [p.id, p.fcm_token]));

  // Строки без токена (пользователь не логинился в приложение с момента
  // установки/или отключил уведомления) — не "попытка", а невозможность
  // отправки в принципе: помечаем sent_at сразу, чтобы не крутить их в
  // очереди впустую до исчерпания attempts.
  const deliverable = [];
  const undeliverable = [];
  for (const row of rows) {
    const token = tokenByUser.get(row.user_id);
    if (token && typeof token === 'string' && token.startsWith('ExponentPushToken')) {
      deliverable.push({ ...row, token });
    } else {
      undeliverable.push(row.id);
    }
  }

  if (undeliverable.length > 0) {
    await supabase.from('notification_outbox').update({ sent_at: new Date().toISOString() }).in('id', undeliverable);
  }

  let sent = 0;
  if (deliverable.length > 0) {
    const messages = deliverable.map((r) => ({
      to: r.token,
      title: r.title,
      body: r.body,
      data: { bookingId: r.booking_id, type: r.type, ...(r.data ?? {}) },
    }));

    let pushOk = false;
    try {
      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      pushOk = resp.ok;
    } catch {
      pushOk = false;
    }

    const ids = deliverable.map((r) => r.id);
    if (pushOk) {
      await supabase.from('notification_outbox').update({ sent_at: new Date().toISOString() }).in('id', ids);
      sent = deliverable.length;

      const reminderIds = deliverable.filter((r) => r.type === 'booking_reminder').map((r) => r.booking_id);
      if (reminderIds.length > 0) {
        await supabase.from('bookings').update({ reminder_sent_at: new Date().toISOString() }).in('id', reminderIds);
      }
    } else {
      // Expo API недоступен/вернул ошибку — не списываем как отправленное,
      // просто считаем попытку, следующий тик cron заберёт строку снова.
      for (const r of deliverable) {
        await supabase.from('notification_outbox').update({ attempts: r.attempts + 1 }).eq('id', r.id);
      }
    }
  }

  return new Response(JSON.stringify({ sent, undeliverable: undeliverable.length }), { status: 200 });
});
