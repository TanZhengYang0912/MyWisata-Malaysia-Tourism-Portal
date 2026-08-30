-- 6.2.3: per-outlet configurable auto-welcome message, with a platform
-- default fallback and an on/off toggle.

alter table outlets add column welcome_message text;
alter table outlets add column welcome_enabled boolean not null default true;

create or replace function send_welcome_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid;
  v_welcome_message text;
  v_welcome_enabled boolean;
begin
  select v.owner_id, o.welcome_message, o.welcome_enabled
    into v_owner_id, v_welcome_message, v_welcome_enabled
  from outlets o join vendors v on v.id = o.vendor_id
  where o.id = new.outlet_id;

  if v_owner_id is not null and v_welcome_enabled then
    insert into chat_messages (thread_id, sender_id, body)
    values (new.id, v_owner_id, coalesce(nullif(trim(v_welcome_message), ''), 'Welcome! Thanks for your interest. Any questions?'));

    update chat_threads set last_message_at = now() where id = new.id;
  end if;

  return new;
end;
$$;
