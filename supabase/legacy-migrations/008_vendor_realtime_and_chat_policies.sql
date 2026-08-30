-- Vendor dashboard realtime subscriptions and authenticated chat writes.
-- Additive only: no data is deleted or rewritten.

DROP POLICY IF EXISTS chat_threads_customer_insert ON chat_threads;
CREATE POLICY chat_threads_customer_insert ON chat_threads
  FOR INSERT WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS chat_threads_participant_update ON chat_threads;
CREATE POLICY chat_threads_participant_update ON chat_threads
  FOR UPDATE USING (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM outlets o JOIN vendors v ON v.id = o.vendor_id
               WHERE o.id = chat_threads.outlet_id AND v.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM outlet_managers om
               WHERE om.outlet_id = chat_threads.outlet_id AND om.user_id = auth.uid())
    OR is_admin(auth.uid())
  ) WITH CHECK (true);

DROP POLICY IF EXISTS chat_messages_participant_insert ON chat_messages;
CREATE POLICY chat_messages_participant_insert ON chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_threads t WHERE t.id = chat_messages.thread_id
        AND (t.customer_id = auth.uid()
             OR is_admin(auth.uid())
             OR EXISTS (SELECT 1 FROM outlets o JOIN vendors v ON v.id = o.vendor_id
                        WHERE o.id = t.outlet_id AND v.owner_id = auth.uid())
             OR EXISTS (SELECT 1 FROM outlet_managers om
                        WHERE om.outlet_id = t.outlet_id AND om.user_id = auth.uid()))
    )
  );

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.products';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.outlets';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_slots';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
