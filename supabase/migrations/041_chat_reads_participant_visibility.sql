-- Widen chat_message_reads SELECT so thread participants can see each
-- other's read rows (not just their own) — required to render read receipts.
-- Mirrors the chat_messages_participant predicate exactly.
drop policy if exists chat_reads_own on chat_message_reads;

create policy chat_reads_participant on chat_message_reads
for select
using (
  exists (
    select 1
    from chat_messages m
    join chat_threads t on t.id = m.thread_id
    where m.id = chat_message_reads.message_id
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

-- Read receipts need to update live, same as messages already do.
alter publication supabase_realtime add table public.chat_message_reads;
