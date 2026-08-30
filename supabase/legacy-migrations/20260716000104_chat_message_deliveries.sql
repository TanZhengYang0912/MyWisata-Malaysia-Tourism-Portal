-- 6.2.4: persistent Delivered receipts (mirrors chat_message_reads).
-- Sent (1 grey tick) -> Delivered (2 grey ticks) -> Read (2 blue ticks).

create table chat_message_deliveries (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references chat_messages(id) on delete cascade,
  user_id      uuid not null references users(id),
  delivered_at timestamptz not null default now(),
  unique (message_id, user_id)
);

alter table chat_message_deliveries enable row level security;

-- Mirrors chat_reads_participant exactly — thread participants can see each
-- other's delivery rows (not just their own), to render the tick state.
create policy chat_deliveries_participant on chat_message_deliveries
for select
using (
  exists (
    select 1
    from chat_messages m
    join chat_threads t on t.id = m.thread_id
    where m.id = chat_message_deliveries.message_id
      and (
        t.customer_id = auth.uid()
        or is_admin(auth.uid())
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

alter publication supabase_realtime add table public.chat_message_deliveries;
