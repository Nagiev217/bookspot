-- Баг из 0024: в publish_business `v_missing || 'описание…'` Postgres
-- разбирал строку как литерал массива (text[] || unknown → text[] || text[])
-- и падал с «malformed array literal» вместо понятного списка недостающих
-- пунктов. array_append однозначно добавляет один элемент.
create or replace function public.publish_business(p_business_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status jsonb;
  v_missing text[] := '{}';
  v_published_at timestamptz;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Опубликовать салон может только владелец' using errcode = '42501';
  end if;

  select b.published_at into v_published_at from public.businesses b where b.id = p_business_id;
  if v_published_at is not null then
    return v_published_at;
  end if;

  v_status := public.business_setup_status(p_business_id);
  if not (v_status->>'description')::boolean then v_missing := array_append(v_missing, 'описание (от 30 символов)'); end if;
  if not (v_status->>'photos')::boolean then v_missing := array_append(v_missing, 'фото салона'); end if;
  if not (v_status->>'masters')::boolean then v_missing := array_append(v_missing, 'мастера'); end if;
  if not (v_status->>'schedule')::boolean then v_missing := array_append(v_missing, 'расписание мастера'); end if;
  if not (v_status->>'services')::boolean then v_missing := array_append(v_missing, 'услуги с мастером'); end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Чтобы опубликовать салон, добавьте: %', array_to_string(v_missing, ', ')
      using errcode = '22023';
  end if;

  perform set_config('bookspot.bypass_role_guard', 'on', true);
  update public.businesses set published_at = now() where id = p_business_id
  returning published_at into v_published_at;
  return v_published_at;
end;
$$;
