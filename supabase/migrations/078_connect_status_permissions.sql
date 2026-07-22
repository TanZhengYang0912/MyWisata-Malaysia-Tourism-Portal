-- 078_connect_status_permissions.sql
-- Allow the authenticated wallet status check to reconcile the caller's own
-- Stripe account while keeping the webhook's service-role path available.

CREATE OR REPLACE FUNCTION public.update_connect_status(
  p_connect_account_id TEXT,
  p_payouts_enabled BOOLEAN
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() NOT IN ('service_role', 'authenticated') THEN
    RAISE EXCEPTION 'Not authorized to update Connect status';
  END IF;

  UPDATE public.users
     SET stripe_payouts_enabled = p_payouts_enabled,
         updated_at = now()
   WHERE stripe_connect_account_id = p_connect_account_id
     AND (auth.role() = 'service_role' OR id = auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.update_connect_status(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_connect_status(TEXT, BOOLEAN) TO authenticated, service_role;
