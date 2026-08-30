-- Repair persistent Delivered receipts in environments where the original
-- chat delivery migration was not applied. Safe for legacy and current DBs.

CREATE TABLE IF NOT EXISTS public.chat_message_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  delivered_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_message_deliveries_message_user_unique
  ON public.chat_message_deliveries (message_id, user_id);

ALTER TABLE public.chat_message_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_deliveries_participant ON public.chat_message_deliveries;
CREATE POLICY chat_deliveries_participant
  ON public.chat_message_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_messages AS m
      JOIN public.chat_threads AS t ON t.id = m.thread_id
      WHERE m.id = chat_message_deliveries.message_id
        AND (
          t.customer_id = auth.uid()
          OR is_admin(auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.outlets AS o
            JOIN public.vendors AS v ON v.id = o.vendor_id
            WHERE o.id = t.outlet_id AND v.owner_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.outlet_managers AS om
            WHERE om.outlet_id = t.outlet_id AND om.user_id = auth.uid()
          )
        )
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_deliveries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
;
