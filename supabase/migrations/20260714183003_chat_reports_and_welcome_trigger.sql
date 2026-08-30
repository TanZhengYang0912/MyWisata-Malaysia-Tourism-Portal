create table chat_reports (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  reporter_id uuid not null references users(id),
  reason text not null,
  details text,
  status varchar not null default 'open',
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table chat_reports enable row level security;

create policy chat_reports_insert on chat_reports
for insert
with check (
  reporter_id = auth.uid()
  and exists (
    select 1 from chat_threads t
    where t.id = chat_reports.thread_id
      and (
        t.customer_id = auth.uid()
        or exists (
          select 1 from outlets o join vendors v on v.id = o.vendor_id
          where o.id = t.outlet_id and v.owner_id = auth.uid()
        )
        or exists (
          select 1 from outlet_managers om
          where om.outlet_id = t.outlet_id and om.user_id = auth.uid()
        )
      )
  )
);

create policy chat_reports_admin_select on chat_reports
for select using (is_admin(auth.uid()));

create policy chat_reports_admin_update on chat_reports
for update using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Welcome message: fixes a silent RLS failure. getOrCreateThread previously
-- inserted this as the vendor owner from the CUSTOMER's browser client,
-- which chat_messages_participant_insert (sender_id = auth.uid()) always
-- rejected — the insert's error was never checked, so it just vanished.
-- SECURITY DEFINER (owned by postgres, which has BYPASSRLS) lets the DB
-- send it as the vendor regardless of who created the thread.
create function send_welcome_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner_id uuid;
begin
  select v.owner_id into v_owner_id
  from outlets o join vendors v on v.id = o.vendor_id
  where o.id = new.outlet_id;

  if v_owner_id is not null then
    insert into chat_messages (thread_id, sender_id, body)
    values (new.id, v_owner_id, 'Welcome! Thanks for your interest. Any questions?');

    update chat_threads set last_message_at = now() where id = new.id;
  end if;

  return new;
end;
$$;

create trigger chat_threads_welcome after insert on chat_threads
for each row execute function send_welcome_message();
;
