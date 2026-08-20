-- P4 — support ticket file attachments (both directions: customer replying
-- to admin, admin replying to customer). Mirrors 042_chat_attachments_bucket
-- exactly (same accepted types/size limit, same private bucket + storage
-- policy shape) — only the ownership check differs (support_tickets.user_id
-- instead of chat_threads.customer_id, and no vendor/outlet-manager branch
-- since a ticket has exactly one non-admin participant).

ALTER TABLE support_ticket_replies ADD COLUMN IF NOT EXISTS attachment_url TEXT;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-attachments', 'ticket-attachments', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Path convention: {ticket_id}/{uuid}.{ext} — folder segment is the ticket id.
create policy ticket_attachments_select on storage.objects
for select
using (
  bucket_id = 'ticket-attachments'
  and exists (
    select 1 from support_tickets t
    where t.id::text = (storage.foldername(name))[1]
      and (t.user_id = auth.uid() or is_admin(auth.uid()))
  )
);

create policy ticket_attachments_insert on storage.objects
for insert
with check (
  bucket_id = 'ticket-attachments'
  and exists (
    select 1 from support_tickets t
    where t.id::text = (storage.foldername(name))[1]
      and (t.user_id = auth.uid() or is_admin(auth.uid()))
  )
);
