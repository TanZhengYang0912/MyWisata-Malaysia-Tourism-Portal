insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Path convention: {thread_id}/{uuid}.{ext} — folder segment is the thread id.
-- Mirrors chat_messages_participant exactly (customer, admin, vendor owner, outlet manager).
create policy chat_attachments_select on storage.objects
for select
using (
  bucket_id = 'chat-attachments'
  and exists (
    select 1 from chat_threads t
    where t.id::text = (storage.foldername(name))[1]
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

create policy chat_attachments_insert on storage.objects
for insert
with check (
  bucket_id = 'chat-attachments'
  and exists (
    select 1 from chat_threads t
    where t.id::text = (storage.foldername(name))[1]
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
