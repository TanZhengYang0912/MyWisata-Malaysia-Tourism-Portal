-- 6.1.2: give chat_threads a direct vendor_id (currently only reachable via
-- outlets.vendor_id) and make (customer_id, outlet_id) unique so
-- getOrCreateThread can't race into duplicate threads.

alter table chat_threads add column vendor_id uuid references vendors(id);

update chat_threads t
set vendor_id = o.vendor_id
from outlets o
where o.id = t.outlet_id and t.vendor_id is null;

-- Auto-derive vendor_id from outlet_id on every insert so app code never has
-- to (and can't) set it wrong.
create function set_chat_thread_vendor_id() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select vendor_id into new.vendor_id from outlets where id = new.outlet_id;
  return new;
end;
$$;

create trigger chat_threads_set_vendor_id before insert on chat_threads
for each row execute function set_chat_thread_vendor_id();

alter table chat_threads alter column vendor_id set not null;

-- Dedupe pre-existing (customer_id, outlet_id) duplicates before the unique
-- constraint: keep the oldest thread, repoint messages/reads to it, drop the
-- rest. Non-destructive to message history.
with ranked as (
  select id, customer_id, outlet_id,
         row_number() over (partition by customer_id, outlet_id order by created_at asc) as rn
  from chat_threads
),
dupes as (
  select r.id as dupe_id, keep.id as keep_id
  from ranked r
  join ranked keep
    on keep.customer_id = r.customer_id and keep.outlet_id = r.outlet_id and keep.rn = 1
  where r.rn > 1
)
update chat_messages m
set thread_id = d.keep_id
from dupes d
where m.thread_id = d.dupe_id;

with ranked as (
  select id, customer_id, outlet_id,
         row_number() over (partition by customer_id, outlet_id order by created_at asc) as rn
  from chat_threads
)
delete from chat_threads where id in (select id from ranked where rn > 1);

alter table chat_threads add constraint chat_threads_customer_outlet_unique unique (customer_id, outlet_id);
