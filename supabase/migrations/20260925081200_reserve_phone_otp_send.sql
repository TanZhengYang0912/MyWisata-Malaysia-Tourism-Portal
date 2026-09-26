-- Make OTP send limits atomic across concurrent requests and across accounts
-- targeting the same number. The reservation row is also required by verify-otp.
CREATE INDEX IF NOT EXISTS phone_verifications_phone_created_at_idx
  ON public.phone_verifications (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_verifications_user_created_at_idx
  ON public.phone_verifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_verifications_created_at_idx
  ON public.phone_verifications (created_at DESC);

-- Remove the earlier authenticated signature if the first draft migration was
-- already applied; only the service-role form may be callable after this file.
DROP FUNCTION IF EXISTS public.reserve_phone_otp_send(TEXT);

CREATE OR REPLACE FUNCTION public.reserve_phone_otp_send(p_user_id UUID, p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := p_user_id;
  v_user_row public.users%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_lock BIGINT;
  v_reservation_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'otp_reservation_service_only';
  END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'otp_auth_required'; END IF;
  IF p_phone IS NULL OR p_phone !~ '^[+][1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'otp_phone_invalid';
  END IF;

  FOR v_lock IN
    SELECT lock_key
      FROM (
        SELECT DISTINCT hashtextextended(lock_name, 0) AS lock_key
          FROM unnest(ARRAY[
            'otp:global',
            'otp:user:' || v_user::TEXT,
            'otp:phone:' || p_phone
          ]) AS names(lock_name)
      ) AS locks
     ORDER BY lock_key
  LOOP
    PERFORM pg_advisory_xact_lock(v_lock);
  END LOOP;

  SELECT * INTO v_user_row
    FROM public.users
   WHERE id = v_user
   FOR SHARE;
  IF NOT FOUND OR v_user_row.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'otp_account_unavailable';
  END IF;
  IF v_user_row.email_verified_at IS NULL THEN
    RAISE EXCEPTION 'otp_email_verification_required';
  END IF;

  IF (SELECT count(*) FROM public.phone_verifications WHERE phone = p_phone AND created_at >= v_now - INTERVAL '1 hour') >= 3
     OR (SELECT count(*) FROM public.phone_verifications WHERE user_id = v_user AND created_at >= v_now - INTERVAL '1 hour') >= 5
     OR (SELECT count(*) FROM public.phone_verifications WHERE created_at >= v_now - INTERVAL '1 hour') >= 100 THEN
    RAISE EXCEPTION 'otp_rate_limited';
  END IF;

  INSERT INTO public.phone_verifications (user_id, phone, expires_at, created_at)
  VALUES (v_user, p_phone, v_now + INTERVAL '10 minutes', v_now)
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object('reservation_id', v_reservation_id, 'expires_at', v_now + INTERVAL '10 minutes');
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_phone_otp_send(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_phone_otp_send(UUID, TEXT) TO service_role;
