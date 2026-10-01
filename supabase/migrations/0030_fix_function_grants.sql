-- Дыра в правах: «только для сервера» функции мог вызвать любой.
--
-- Во всех миграциях серверные функции закрывались так:
--   revoke all on function ... from public;
--   grant execute on function ... to service_role;
-- Но в Supabase схема public настроена default privileges, которые при
-- создании функции выдают EXECUTE ролям anon и authenticated НАПРЯМУЮ, а
-- не через public. revoke from public их не снимает. Итог: любой
-- пользователь приложения — и даже гость с публичным anon-ключом — мог
-- вызвать, например, set_platform_admin(свой id, true) и стать
-- администратором платформы, или admin_create_business / link_staff.
-- Проверено на живой базе: has_function_privilege('anon', ...) = true.
-- Следов использования нет (единственный admin — тот, что назначен
-- вручную).

-- 1. Серверные функции — только service_role (Edge Function manage-accounts,
--    scripts/*) и pg_cron (работает от владельца функции).
revoke execute on function public.set_platform_admin(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_create_business(uuid, text, text, text, text, text, text, date) from public, anon, authenticated;
revoke execute on function public.link_staff(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_unlink_business(uuid) from public, anon, authenticated;
revoke execute on function public.expire_booking_requests() from public, anon, authenticated;

-- 2. Внутренние помощники — вызываются только из других функций.
revoke execute on function public.require_booking_staff(public.bookings, uuid) from public, anon, authenticated;

-- 3. Функции для вошедших пользователей — гостю (anon) не нужны. Каждая и
--    так проверяет auth.uid(), это вторая линия защиты.
revoke execute on function public.create_business from anon;
revoke execute on function public.accept_booking(uuid) from anon;
revoke execute on function public.decline_booking(uuid) from anon;
revoke execute on function public.propose_booking_time(uuid, date, text) from anon;
revoke execute on function public.respond_to_proposal(uuid, boolean) from anon;
revoke execute on function public.publish_business(uuid) from anon;
revoke execute on function public.business_setup_status(uuid) from anon;
revoke execute on function public.update_my_master_profile(text, text, text, int) from anon;
revoke execute on function public.admin_list_businesses() from anon;
revoke execute on function public.admin_set_subscription from anon;
revoke execute on function public.admin_set_business_status from anon;

-- 4. Чтобы ошибка не повторилась: новые функции в public больше не
--    получают EXECUTE для anon/authenticated автоматически — каждую нужно
--    открыть явным grant. Забытый grant проявится сразу в verify-скриптах
--    («permission denied»), а не тихой дырой.
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
