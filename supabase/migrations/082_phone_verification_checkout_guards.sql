-- Enforce the phone gate inside the database-owned order mutation boundary.
-- The Next.js checkout routes also fail fast, but this trigger protects direct
-- authenticated calls to prepare_checkout and any future order RPC.
CREATE OR REPLACE FUNCTION public.enforce_phone_verified_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'checkout_auth_required';
  END IF;

  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'checkout_not_owned';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.users
     WHERE id = auth.uid()
       AND phone_verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'phone_verification_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_require_phone_verification ON public.orders;
CREATE TRIGGER orders_require_phone_verification
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_phone_verified_order();

REVOKE ALL ON FUNCTION public.enforce_phone_verified_order() FROM PUBLIC;
