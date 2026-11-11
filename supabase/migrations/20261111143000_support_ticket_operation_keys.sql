-- Persist a retry key on support-ticket creation so a lost HTTP response
-- cannot create a second ticket when the user retries the same intent.
ALTER TABLE public.support_tickets
  ADD COLUMN operation_id uuid,
  ADD COLUMN operation_payload_hash text;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_operation_hash_shape
  CHECK (operation_payload_hash IS NULL OR operation_payload_hash ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX support_tickets_user_operation_unique
  ON public.support_tickets(user_id, operation_id)
  WHERE user_id IS NOT NULL AND operation_id IS NOT NULL;

CREATE UNIQUE INDEX support_tickets_guest_operation_unique
  ON public.support_tickets(session_id, operation_id)
  WHERE user_id IS NULL AND session_id IS NOT NULL AND operation_id IS NOT NULL;
