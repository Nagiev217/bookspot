-- Отзывы клиентов о салоне — до сих пор отсутствовали полностью: ни
-- таблицы, ни экрана. StarBadge.jsx ("★ 4.9") существовал в компонентах, но
-- нигде не использовался — просто заготовка без данных под ней.
--
-- Один отзыв на каждый ЗАВЕРШЁННЫЙ визит (booking_id), а не один общий
-- отзыв на салон — точнее отражает конкретный опыт, и unique-ограничение на
-- booking_id само по себе защищает от повторного отзыва без отдельной
-- проверки "уже оставлял ли". complete_booking (0015) — единственный путь
-- брони в статус 'completed', поэтому отзыв надёжно привязан к реально
-- состоявшемуся визиту (тот же принцип, что в product-concept.md: "отзыв
-- доступен только после booking.status = completed").
--
-- Ответа бизнеса на отзыв в этой версии сознательно нет — отдельная задача.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  -- on delete set null, не cascade — как masters.user_id (0013): удаление
  -- аккаунта не должно уносить с собой сам отзыв, только обезличить автора
  -- (см. delete_my_account ниже).
  client_id uuid references public.profiles(id) on delete set null,
  business_id uuid not null references public.businesses(id) on delete cascade,
  master_id uuid references public.masters(id) on delete set null,
  client_name text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.reviews enable row level security;

-- Отзывы читает кто угодно, включая гостя (0014_guest_catalog — тот же дух:
-- решение о салоне должно приниматься до регистрации, а не после).
create policy "reviews_public_read" on public.reviews for select using (true);

create policy "reviews_own_update" on public.reviews for update using (client_id = auth.uid());
create policy "reviews_own_delete" on public.reviews for delete using (client_id = auth.uid());

-- Прямой INSERT с клиента запрещён явной политикой (тот же приём, что
-- bookings_no_direct_write в 0001_init.sql) — создание обязано проверить,
-- что бронь принадлежит вызывающему и действительно completed, это может
-- только SECURITY DEFINER RPC ниже.
create policy "reviews_no_direct_insert" on public.reviews for insert with check (false);

-- booking_id/business_id/master_id/client_id/client_name фиксируются в
-- момент создания и не должны меняться при редактировании своего отзыва —
-- иначе клиент через UPDATE мог бы, например, переставить свой старый
-- отзыв на другой салон. Разрешены только rating/comment.
create function public.lock_review_identity()
returns trigger language plpgsql as $$
begin
  if new.booking_id <> old.booking_id
    or new.business_id <> old.business_id
    or new.master_id is distinct from old.master_id
    or new.client_id is distinct from old.client_id
    or new.client_name <> old.client_name
  then
    raise exception 'Эти поля отзыва нельзя менять' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger reviews_lock_identity
  before update on public.reviews
  for each row execute function public.lock_review_identity();

-- Тот же паттерн, что complete_booking (0015) и delete_my_account (0013):
-- v_uid := auth.uid(), '28000' без авторизации, 'P0002' если ресурс не
-- найден/не принадлежит вызывающему, '22023' на нарушение бизнес-правила.
create function public.create_review(p_booking_id uuid, p_rating smallint, p_comment text default null)
returns table (id uuid, rating smallint, comment text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_client_name text;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Оценка должна быть от 1 до 5' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  -- is distinct from, не <> — у брони "по звонку" client_id может быть
  -- null, и null <> v_uid дал бы NULL (то есть IF молча пропустил бы
  -- проверку) вместо явного отказа.
  if v_booking.id is null or v_booking.client_id is distinct from v_uid then
    raise exception 'Бронь не найдена' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'completed' then
    raise exception 'Отзыв можно оставить только после завершённого визита' using errcode = '22023';
  end if;

  select p.name into v_client_name from public.profiles p where p.id = v_uid;

  begin
    insert into public.reviews (booking_id, client_id, business_id, master_id, client_name, rating, comment)
    values (p_booking_id, v_uid, v_booking.business_id, v_booking.master_id, v_client_name, p_rating, p_comment)
    returning reviews.id into v_new_id;
  exception when unique_violation then
    raise exception 'Вы уже оставили отзыв на этот визит' using errcode = '23505';
  end;

  return query select r.id, r.rating, r.comment, r.created_at from public.reviews r where r.id = v_new_id;
end;
$$;

revoke all on function public.create_review from public;
grant execute on function public.create_review to authenticated;

-- Денормализованный рейтинг на businesses — чтобы карточки салона в
-- каталоге (Home/Search) не считали avg/count по reviews на каждый список.
-- rating_avg остаётся NULL, пока отзывов нет (avg() по нулю строк и так
-- даёт NULL сам по себе) — на клиенте это "—", а не фальшивый "0.0 ★".
alter table public.businesses add column rating_avg numeric(2,1);
alter table public.businesses add column review_count int not null default 0;

create function public.recompute_business_rating()
returns trigger language plpgsql as $$
declare
  v_business_id uuid := coalesce(new.business_id, old.business_id);
begin
  update public.businesses b
  set rating_avg = sub.avg_rating, review_count = sub.cnt
  from (
    select avg(rating)::numeric(2,1) as avg_rating, count(*) as cnt
    from public.reviews where business_id = v_business_id
  ) sub
  where b.id = v_business_id;
  return null;
end;
$$;

create trigger reviews_recompute_rating
  after insert or update of rating or delete on public.reviews
  for each row execute function public.recompute_business_rating();

-- delete_my_account (0013) — добавляем анонимизацию отзывов тем же приёмом,
-- что уже применён к bookings: отзыв остаётся (он о салоне, не приватные
-- данные автора), а не удаляется вместе с аккаунтом — иначе рейтинг салона
-- менялся бы задним числом каждый раз, когда автор одного из старых
-- отзывов решает удалить аккаунт.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_business_id uuid;
begin
  if v_uid is null then
    raise exception 'Требуется авторизация' using errcode = '28000';
  end if;

  select role, business_id into v_role, v_business_id from public.profiles where id = v_uid;

  if v_role = 'business_owner' and v_business_id is not null then
    raise exception 'Сначала отвяжите или передайте свой бизнес — аккаунт владельца активного салона нельзя удалить напрямую'
      using errcode = '23503';
  end if;

  update public.bookings
  set client_id = null,
      client_name = 'Удалённый пользователь',
      client_phone = null
  where client_id = v_uid;

  update public.reviews
  set client_id = null,
      client_name = 'Удалённый пользователь'
  where client_id = v_uid;

  update public.masters
  set user_id = null
  where user_id = v_uid;

  -- favorites и business_members уходят каскадом вместе с profiles ниже
  -- (обе таблицы объявлены "on delete cascade" от profiles(id) в 0001).
  -- profiles сама уходит каскадом от auth.users — отдельный DELETE не нужен.
  delete from auth.users where id = v_uid;
end;
$$;
