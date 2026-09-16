-- Административная зачистка: снять ссылку profiles.business_id перед
-- удалением бизнеса. Обычным UPDATE это невозможно — триггер
-- prevent_profile_privilege_escalation (0001_init.sql) блокирует любое
-- изменение business_id без GUC-байпаса, который умеют ставить только
-- SECURITY DEFINER функции (как create_business). Без этого хелпера
-- businesses.owner_id -> profiles и profiles.business_id -> businesses
-- образуют цикл с NO ACTION по умолчанию: бизнес нельзя удалить, пока на
-- него ссылается профиль, а профиль нельзя удалить, пока на него
-- ссылается businesses.owner_id — тупик в любом порядке.
--
-- Нужен: 1) scripts/verify-selfserve.js — создаёт реальный бизнес на
-- каждый прогон и должен уметь его убрать; 2) будущий флоу удаления
-- аккаунта (см. план, этап 10) — владелец бизнеса удаляет себя, и та же
-- цикличная блокировка иначе помешает снести его auth.users-запись.
create function public.admin_unlink_business(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.profiles set business_id = null where business_id = p_business_id;
end;
$$;

revoke all on function public.admin_unlink_business from public;
grant execute on function public.admin_unlink_business to service_role;
