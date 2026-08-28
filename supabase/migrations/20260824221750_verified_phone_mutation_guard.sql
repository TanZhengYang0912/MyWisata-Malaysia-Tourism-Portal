-- Phone ownership can only be changed after provider OTP verification. Direct
-- table updates and direct authenticated calls to the promotion RPC fail closed.

CREATE OR REPLACE FUNCTION public.protect_verification_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone
     AND current_setting('app.allow_verification_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'phone_change_requires_otp';
  END IF;

  IF current_setting('app.allow_verification_write', true) = 'on'
     OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at
     OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
    RAISE EXCEPTION 'verification_fields_are_server_managed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_to_phone_verified(
  p_user_id UUID,
  p_phone TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('phone_verify:' || p_phone));
  IF EXISTS (
    SELECT 1
      FROM public.users
     WHERE phone = p_phone
       AND phone_verified_at IS NOT NULL
       AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'phone_already_claimed';
  END IF;

  SELECT tier INTO v_tier FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found: %', p_user_id; END IF;
  IF public.tier_rank(v_tier) < public.tier_rank('email_verified') THEN
    RAISE EXCEPTION 'tier_insufficient: email_verified required';
  END IF;

  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users
     SET tier = CASE
           WHEN public.tier_rank(tier) < public.tier_rank('phone_verified') THEN 'phone_verified'
           ELSE tier
         END,
         phone = p_phone,
         phone_verified_at = now(),
         updated_at = now()
   WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_phone_verified(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_to_phone_verified(UUID, TEXT) TO service_role;
