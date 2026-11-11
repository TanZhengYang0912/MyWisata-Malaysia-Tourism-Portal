-- Make retries of the same authenticated ticket reply return the original
-- reply rather than inserting a duplicate after a lost response.
ALTER TABLE public.support_ticket_replies
  ADD COLUMN operation_id uuid,
  ADD COLUMN operation_payload_hash text;

ALTER TABLE public.support_ticket_replies
  ADD CONSTRAINT support_ticket_replies_operation_hash_shape
  CHECK (operation_payload_hash IS NULL OR operation_payload_hash ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX support_ticket_replies_sender_operation_unique
  ON public.support_ticket_replies(ticket_id, sender_id, operation_id)
  WHERE operation_id IS NOT NULL;
