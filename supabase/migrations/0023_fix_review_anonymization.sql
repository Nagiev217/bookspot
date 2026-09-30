-- Баг из 0019: lock_review_identity запрещал любое изменение client_id и
-- client_name, в том числе обезличивание в delete_my_account (0019) и в
-- manage-accounts/remove_staff. Итог — удаление аккаунта падало с «Эти поля
-- отзыва нельзя менять» у любого, кто оставлял отзыв (а удаление аккаунта —
-- требование App Store 5.1.1(v)).
--
-- Разрешаем ровно одно изменение автора — обезличивание: client_id → null и
-- client_name → 'Удалённый пользователь'. Переставить отзыв на другой салон,
-- мастера, бронь или другого автора по-прежнему нельзя.
create or replace function public.lock_review_identity()
returns trigger language plpgsql as $$
declare
  v_anonymizing boolean := new.client_id is null and new.client_name = 'Удалённый пользователь';
begin
  if new.booking_id <> old.booking_id
    or new.business_id <> old.business_id
    or new.master_id is distinct from old.master_id
    or (not v_anonymizing and (new.client_id is distinct from old.client_id or new.client_name <> old.client_name))
  then
    raise exception 'Эти поля отзыва нельзя менять' using errcode = '22023';
  end if;
  -- Обезличивание — не правка отзыва автором, updated_at не трогаем.
  if not v_anonymizing then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
