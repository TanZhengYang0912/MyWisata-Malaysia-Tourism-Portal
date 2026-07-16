DROP POLICY IF EXISTS voucher_events_user_insert ON public.voucher_events;
CREATE POLICY voucher_events_user_insert ON public.voucher_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
