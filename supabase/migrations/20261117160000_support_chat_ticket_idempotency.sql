ALTER TABLE public.support_tickets
  ADD COLUMN chatbot_message_id uuid REFERENCES public.chatbot_messages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX support_tickets_chatbot_message_id_unique
  ON public.support_tickets (chatbot_message_id)
  WHERE chatbot_message_id IS NOT NULL;
