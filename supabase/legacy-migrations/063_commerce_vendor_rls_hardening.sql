-- Tighten the additive commerce tables and trigger functions introduced by
-- 20260716000300. Internal rows remain available to their RPCs/service role,
-- but are not exposed as arbitrary authenticated write APIs.

DROP POLICY IF EXISTS checkout_reservations_admin_select ON public.checkout_reservations;
CREATE POLICY checkout_reservations_admin_select ON public.checkout_reservations
  FOR SELECT TO authenticated USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS voucher_holds_owner_select ON public.voucher_holds;
CREATE POLICY voucher_holds_owner_select ON public.voucher_holds
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS payment_events_admin_select ON public.payment_events;
CREATE POLICY payment_events_admin_select ON public.payment_events
  FOR SELECT TO authenticated USING (is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS vendor_recommendation_invites_admin_select ON public.vendor_recommendation_invites;
CREATE POLICY vendor_recommendation_invites_admin_select ON public.vendor_recommendation_invites
  FOR SELECT TO authenticated USING (is_admin((SELECT auth.uid())));

REVOKE ALL ON FUNCTION public.validate_product_outlet_vendor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_booking_slot_outlet_product() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_voucher_targets() FROM PUBLIC, anon, authenticated;
