-- Link each new bot reply to the exact sanitized user message that produced it.
-- Historical rows remain unpaired rather than being guessed by timestamp.
ALTER TABLE public.chatbot_messages
  ADD COLUMN reply_to_message_id uuid
  REFERENCES public.chatbot_messages(id) ON DELETE SET NULL;

CREATE INDEX chatbot_messages_reply_to_message_id_idx
  ON public.chatbot_messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
