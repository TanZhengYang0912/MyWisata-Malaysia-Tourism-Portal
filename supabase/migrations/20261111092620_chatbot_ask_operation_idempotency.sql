-- Reserve each customer ask on its sanitized user turn before calling Gemini.
ALTER TABLE public.chatbot_messages
  ADD COLUMN operation_id uuid,
  ADD COLUMN operation_payload_hash text,
  ADD COLUMN answer_language text,
  ADD COLUMN privacy_blocked boolean;

ALTER TABLE public.chatbot_messages
  ADD CONSTRAINT chatbot_messages_operation_payload_hash_check
    CHECK (operation_id IS NULL OR (operation_payload_hash IS NOT NULL AND operation_payload_hash ~ '^[0-9a-f]{64}$'));

CREATE UNIQUE INDEX chatbot_messages_user_operation_unique
  ON public.chatbot_messages(session_id, operation_id)
  WHERE role = 'user' AND operation_id IS NOT NULL;
