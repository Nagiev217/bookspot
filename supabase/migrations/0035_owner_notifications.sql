-- Пункт 3 сквозной проверки — владелец салона:
--  • перенос подтверждённой записи салоном не сообщался клиенту вообще
--    (клиент приходил в старое время) — теперь push «Салон перенёс вашу запись»;
--  • о новых отзывах салон не узнавал — теперь push владельцу и мастеру.

alter table public.notification_outbox drop constraint notification_outbox_type_check;
alter table public.notification_outbox add constraint notification_outbox_type_check
  check (type in (
    'booking_confirmed', 'booking_reminder', 'booking_cancelled', 'new_booking_business',
    'booking_proposed', 'booking_declined', 'proposal_answered', 'review_request',
    'booking_rescheduled', 'new_review'
  ));

create or replace function public.notif_text(p_lang text, p_key text, p_args jsonb default '{}'::jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_dict constant jsonb := $json${
    "ru": {
      "client": "Клиент",
      "new_request.title": "Новая заявка",
      "new_request.body": "{client} — {service}, {when}. Подтвердите в течение 2 часов",
      "new_booking.title": "Новая запись",
      "new_booking.body": "{client} — {service}, {when}",
      "confirmed.title": "Запись подтверждена",
      "confirmed.body": "{service} — {when}",
      "proposed.title": "Мастер предложил другое время",
      "proposed.body": "{service} — {when} вместо {old}. Примите или откажитесь",
      "proposal_accepted.title": "Клиент принял ваше время",
      "proposal_accepted.body": "{client} — {service}, {when}",
      "declined.title": "Мастер не сможет принять",
      "declined.body": "{service} — {when}. Выберите другое время",
      "expired.title": "Заявка не подтверждена",
      "expired.body": "Салон не ответил вовремя: {service} — {when}. Попробуйте другое время",
      "proposal_expired.title": "Клиент не ответил на ваше время",
      "proposal_expired.body": "{client} — {service}, {when}. Время освобождено",
      "proposal_declined.title": "Клиент отказался от времени",
      "proposal_declined.body": "{client} — {service}, {when}. Время освобождено",
      "client_cancelled.title": "Клиент отменил запись",
      "client_cancelled.body": "{client} — {service}, {when}",
      "cancelled.title": "Запись отменена",
      "cancelled.body": "{service} — {when}",
      "client_rescheduled.title": "Клиент перенёс запись",
      "client_rescheduled.body": "{client} — {service}, {when} вместо {old}. Подтвердите новое время",
      "reminder.title": "Напоминание о записи",
      "reminder.body": "{service} сегодня в {time}",
      "review_request.title": "Как прошёл визит? Оставьте отзыв",
      "review_request.body": "{service} — оцените мастера, это займёт минуту",
      "salon_rescheduled.title": "Салон перенёс вашу запись",
      "salon_rescheduled.body": "{service} — {when} вместо {old}",
      "new_review.title": "Новый отзыв · {stars}",
      "new_review.body": "{client} — {service}{comment}"
    },
    "az": {
      "client": "Müştəri",
      "new_request.title": "Yeni müraciət",
      "new_request.body": "{client} — {service}, {when}. 2 saat ərzində təsdiqləyin",
      "new_booking.title": "Yeni yazılış",
      "new_booking.body": "{client} — {service}, {when}",
      "confirmed.title": "Yazılış təsdiqləndi",
      "confirmed.body": "{service} — {when}",
      "proposed.title": "Usta başqa vaxt təklif etdi",
      "proposed.body": "{service} — {old} əvəzinə {when}. Qəbul edin və ya imtina edin",
      "proposal_accepted.title": "Müştəri təklif etdiyiniz vaxtı qəbul etdi",
      "proposal_accepted.body": "{client} — {service}, {when}",
      "declined.title": "Usta qəbul edə bilməyəcək",
      "declined.body": "{service} — {when}. Başqa vaxt seçin",
      "expired.title": "Müraciət təsdiqlənmədi",
      "expired.body": "Salon vaxtında cavab vermədi: {service} — {when}. Başqa vaxt seçin",
      "proposal_expired.title": "Müştəri təklif etdiyiniz vaxta cavab vermədi",
      "proposal_expired.body": "{client} — {service}, {when}. Vaxt boşaldıldı",
      "proposal_declined.title": "Müştəri vaxtdan imtina etdi",
      "proposal_declined.body": "{client} — {service}, {when}. Vaxt boşaldıldı",
      "client_cancelled.title": "Müştəri yazılışı ləğv etdi",
      "client_cancelled.body": "{client} — {service}, {when}",
      "cancelled.title": "Yazılış ləğv edildi",
      "cancelled.body": "{service} — {when}",
      "client_rescheduled.title": "Müştəri yazılışı köçürdü",
      "client_rescheduled.body": "{client} — {service}, {old} əvəzinə {when}. Yeni vaxtı təsdiqləyin",
      "reminder.title": "Yazılış xatırlatması",
      "reminder.body": "{service} — bu gün, saat {time}",
      "review_request.title": "Gəliş necə keçdi? Rəy yazın",
      "review_request.body": "{service} — ustanı qiymətləndirin, bir dəqiqə çəkir",
      "salon_rescheduled.title": "Salon yazılışınızı köçürdü",
      "salon_rescheduled.body": "{service} — {old} əvəzinə {when}",
      "new_review.title": "Yeni rəy · {stars}",
      "new_review.body": "{client} — {service}{comment}"
    },
    "en": {
      "client": "Client",
      "new_request.title": "New request",
      "new_request.body": "{client} — {service}, {when}. Confirm within 2 hours",
      "new_booking.title": "New booking",
      "new_booking.body": "{client} — {service}, {when}",
      "confirmed.title": "Booking confirmed",
      "confirmed.body": "{service} — {when}",
      "proposed.title": "The master proposed another time",
      "proposed.body": "{service} — {when} instead of {old}. Accept or decline",
      "proposal_accepted.title": "The client accepted your time",
      "proposal_accepted.body": "{client} — {service}, {when}",
      "declined.title": "The master can't take you",
      "declined.body": "{service} — {when}. Please choose another time",
      "expired.title": "Request not confirmed",
      "expired.body": "The salon didn't reply in time: {service} — {when}. Try another time",
      "proposal_expired.title": "The client didn't answer your time",
      "proposal_expired.body": "{client} — {service}, {when}. The time is free again",
      "proposal_declined.title": "The client declined the time",
      "proposal_declined.body": "{client} — {service}, {when}. The time is free again",
      "client_cancelled.title": "The client cancelled",
      "client_cancelled.body": "{client} — {service}, {when}",
      "cancelled.title": "Booking cancelled",
      "cancelled.body": "{service} — {when}",
      "client_rescheduled.title": "The client rescheduled",
      "client_rescheduled.body": "{client} — {service}, {when} instead of {old}. Confirm the new time",
      "reminder.title": "Booking reminder",
      "reminder.body": "{service} today at {time}",
      "review_request.title": "How was your visit? Leave a review",
      "review_request.body": "{service} — rate your master, it takes a minute",
      "salon_rescheduled.title": "The salon moved your booking",
      "salon_rescheduled.body": "{service} — {when} instead of {old}",
      "new_review.title": "New review · {stars}",
      "new_review.body": "{client} — {service}{comment}"
    }
  }$json$::jsonb;
  v_lang text := case when p_lang in ('ru', 'az', 'en') then p_lang else 'ru' end;
  v_text text;
  v_arg record;
begin
  v_text := coalesce(v_dict -> v_lang ->> p_key, v_dict -> 'ru' ->> p_key, p_key);
  -- Имя клиента не задано (запись «по звонку» без имени) — слово «Клиент» на нужном языке.
  if p_args ? 'client' and coalesce(p_args ->> 'client', '') = '' then
    p_args := p_args || jsonb_build_object('client', v_dict -> v_lang ->> 'client');
  end if;
  for v_arg in select key, value from jsonb_each_text(p_args) loop
    v_text := replace(v_text, '{' || v_arg.key || '}', coalesce(v_arg.value, ''));
  end loop;
  return v_text;
end;
$$;


create or replace function public.enqueue_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_args jsonb;
  v_staff_key text;
  v_staff_type text;
  v_client_key text;
  v_client_type text;
  v_when_local timestamp;
begin
  v_args := jsonb_build_object(
    'client', coalesce(new.client_name, ''),
    'service', new.service_name,
    'when', to_char(new.starts_at at time zone 'Asia/Baku', 'DD.MM HH24:MI'),
    'time', to_char(new.starts_at at time zone 'Asia/Baku', 'HH24:MI'),
    'old', case when TG_OP = 'UPDATE' then to_char(old.starts_at at time zone 'Asia/Baku', 'DD.MM HH24:MI') else '' end
  );

  if TG_OP = 'INSERT' then
    if new.status = 'pending' then
      v_staff_key := 'new_request';
    else
      v_staff_key := 'new_booking';
      v_client_key := 'confirmed';
      v_client_type := 'booking_confirmed';
    end if;

  elsif TG_OP = 'UPDATE' then
    -- Напоминание всегда соответствует текущему времени подтверждённой записи.
    if new.status is distinct from old.status or new.starts_at is distinct from old.starts_at then
      delete from public.notification_outbox
      where booking_id = new.id and type = 'booking_reminder' and sent_at is null;
    end if;

    if old.status = 'pending' and new.status = 'confirmed' then
      v_client_key := 'confirmed';
      v_client_type := 'booking_confirmed';
    elsif old.status = 'pending' and new.status = 'proposed' then
      v_client_key := 'proposed';
      v_client_type := 'booking_proposed';
    elsif old.status = 'proposed' and new.status = 'confirmed' then
      v_staff_key := 'proposal_accepted';
    elsif new.status = 'cancelled' and old.status in ('pending', 'proposed', 'confirmed') then
      case new.cancel_reason
        when 'declined' then
          v_client_key := 'declined';
          v_client_type := 'booking_declined';
        when 'expired' then
          if old.status = 'pending' then
            v_client_key := 'expired';
            v_client_type := 'booking_declined';
          else
            v_staff_key := 'proposal_expired';
          end if;
        when 'proposal_declined' then
          v_staff_key := 'proposal_declined';
        when 'client' then
          v_staff_key := 'client_cancelled';
        else
          v_client_key := 'cancelled';
          v_client_type := 'booking_cancelled';
      end case;
    elsif old.status = 'confirmed' and new.status = 'confirmed' and new.starts_at is distinct from old.starts_at then
      -- Перенос подтверждённой записи остаётся confirmed только у салона
      -- (перенос клиентом снова делает её заявкой) — сообщаем клиенту.
      v_client_key := 'salon_rescheduled';
      v_client_type := 'booking_rescheduled';
    elsif old.status in ('pending', 'confirmed') and new.status = 'pending' and new.starts_at is distinct from old.starts_at then
      v_staff_key := 'client_rescheduled';
    end if;
  end if;

  if v_client_key is not null and new.client_id is not null then
    insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
    select new.client_id, new.id, v_client_type,
      public.notif_text(p.lang, v_client_key || '.title', v_args),
      public.notif_text(p.lang, v_client_key || '.body', v_args),
      now()
    from public.profiles p where p.id = new.client_id;
  end if;

  if v_staff_key is not null then
    v_staff_type := case
      when TG_OP = 'INSERT' or new.status = 'pending' then 'new_booking_business'
      when new.status = 'cancelled' and new.cancel_reason = 'client' then 'booking_cancelled'
      else 'proposal_answered'
    end;
    insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
    select r.uid, new.id, v_staff_type,
      public.notif_text(p.lang, v_staff_key || '.title', v_args),
      public.notif_text(p.lang, v_staff_key || '.body', v_args),
      now()
    from (
      select b.owner_id as uid from public.businesses b where b.id = new.business_id
      union
      select m.user_id from public.masters m where m.id = new.master_id and m.user_id is not null
    ) r
    join public.profiles p on p.id = r.uid;
  end if;

  -- Визит отмечен «пришёл» — через час после окончания просим отзыв.
  -- Ночью (22:00–09:00 по Баку) не будим: переносим на 10:00.
  if TG_OP = 'UPDATE' and old.status = 'confirmed' and new.status = 'completed' and new.client_id is not null then
    v_when_local := (greatest(now(), new.ends_at) + interval '1 hour') at time zone 'Asia/Baku';
    if v_when_local::time >= time '22:00' then
      v_when_local := (v_when_local::date + 1) + time '10:00';
    elsif v_when_local::time < time '09:00' then
      v_when_local := v_when_local::date + time '10:00';
    end if;
    insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
    select new.client_id, new.id, 'review_request',
      public.notif_text(p.lang, 'review_request.title', v_args),
      public.notif_text(p.lang, 'review_request.body', v_args),
      v_when_local at time zone 'Asia/Baku'
    from public.profiles p where p.id = new.client_id;
  end if;

  -- Напоминание за 2 часа — на каждую подтверждённую запись клиента
  -- (сразу подтверждённую при INSERT или ставшую confirmed/перенесённую).
  if new.status = 'confirmed' and new.client_id is not null
     and (TG_OP = 'INSERT' or new.status is distinct from old.status or new.starts_at is distinct from old.starts_at) then
    insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
    select new.client_id, new.id, 'booking_reminder',
      public.notif_text(p.lang, 'reminder.title', v_args),
      public.notif_text(p.lang, 'reminder.body', v_args),
      new.starts_at - interval '2 hours'
    from public.profiles p where p.id = new.client_id;
  end if;

  return new;
end;
$$;


-- Новый отзыв → владельцу салона и мастеру этой записи (если у него есть логин).
create function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service text;
  v_args jsonb;
begin
  select b.service_name into v_service from public.bookings b where b.id = new.booking_id;
  v_args := jsonb_build_object(
    'client', coalesce(new.client_name, ''),
    'service', coalesce(v_service, ''),
    'stars', repeat('★', new.rating) || repeat('☆', 5 - new.rating),
    'comment', case when coalesce(trim(new.comment), '') = '' then ''
                    else ': «' || left(trim(new.comment), 120) || '»' end
  );
  insert into public.notification_outbox (user_id, booking_id, type, title, body, send_after)
  select r.uid, new.booking_id, 'new_review',
    public.notif_text(p.lang, 'new_review.title', v_args),
    public.notif_text(p.lang, 'new_review.body', v_args),
    now()
  from (
    select b.owner_id as uid from public.businesses b where b.id = new.business_id
    union
    select m.user_id from public.masters m where m.id = new.master_id and m.user_id is not null
  ) r
  join public.profiles p on p.id = r.uid;
  return new;
end;
$$;
revoke execute on function public.notify_new_review() from public, anon, authenticated;

create trigger reviews_notify_new
  after insert on public.reviews
  for each row execute function public.notify_new_review();
