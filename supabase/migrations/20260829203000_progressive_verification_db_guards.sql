-- Close legacy mutation paths that could bypass the progressive customer
-- verification contract. This migration is forward-only and does not change
-- table shape or historical data.

-- Orders, including service-role demo purchases, require a phone-verified
-- owner. Service role may act for the owner but may not bypass the owner fact.
CREATE OR REPLACE FUNCTION public.enforce_phone_verified_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
  IF v_role <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'checkout_auth_required';
    END IF;
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'checkout_not_owned';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = NEW.user_id
       AND u.email_verified_at IS NOT NULL
       AND u.phone_verified_at IS NOT NULL
       AND COALESCE(u.status, 'suspended') = 'active'
  ) THEN
    RAISE EXCEPTION 'phone_verification_required';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_phone_verified_order() FROM PUBLIC;

-- Recommendation submission must remain Profile Complete even when a caller
-- bypasses the Next route and invokes the SECURITY DEFINER RPC directly.
CREATE OR REPLACE FUNCTION public.enforce_recommendation_profile_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND (auth.uid() IS NULL OR NEW.recommender_id IS DISTINCT FROM auth.uid())
  THEN
    RAISE EXCEPTION 'recommendation_not_owned';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = NEW.recommender_id
       AND u.email_verified_at IS NOT NULL
       AND COALESCE(u.status, 'suspended') = 'active'
       AND (u.profile_completed_at IS NOT NULL OR u.kyc_status = 'approved')
  ) THEN
    RAISE EXCEPTION 'profile_completion_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_recommendations_require_profile_complete
  ON public.vendor_recommendations;
CREATE TRIGGER vendor_recommendations_require_profile_complete
  BEFORE INSERT ON public.vendor_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_recommendation_profile_complete();

REVOKE ALL ON FUNCTION public.enforce_recommendation_profile_complete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_recommendation_with_evidence(
  TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, DOUBLE PRECISION,
  DOUBLE PRECISION, TEXT, TEXT, TEXT, UUID[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_recommendation_with_evidence(
  TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, DOUBLE PRECISION,
  DOUBLE PRECISION, TEXT, TEXT, TEXT, UUID[]
) TO authenticated;

DROP POLICY IF EXISTS vendor_rec_insert_own ON public.vendor_recommendations;
CREATE POLICY vendor_rec_insert_own ON public.vendor_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = recommender_id
    AND EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND u.email_verified_at IS NOT NULL
         AND COALESCE(u.status, 'suspended') = 'active'
         AND (u.profile_completed_at IS NOT NULL OR u.kyc_status = 'approved')
    )
  );

-- Limited affiliate mode starts at Profile Complete. Vendor and outlet staff
-- are excluded at the database boundary, not only in the application route.
CREATE OR REPLACE FUNCTION public.enforce_affiliate_link_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = NEW.user_id
       AND u.email_verified_at IS NOT NULL
       AND COALESCE(u.status, 'suspended') = 'active'
       AND (u.profile_completed_at IS NOT NULL OR u.kyc_status = 'approved')
  ) THEN
    RAISE EXCEPTION 'profile_completion_required';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = NEW.user_id
       AND r.name IN ('vendor_owner', 'outlet_manager')
  ) THEN
    RAISE EXCEPTION 'vendor_affiliate_ineligible';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS affiliate_links_require_eligible_profile
  ON public.affiliate_links;
CREATE TRIGGER affiliate_links_require_eligible_profile
  BEFORE INSERT ON public.affiliate_links
  FOR EACH ROW EXECUTE FUNCTION public.enforce_affiliate_link_eligibility();
REVOKE ALL ON FUNCTION public.enforce_affiliate_link_eligibility() FROM PUBLIC;

DROP POLICY IF EXISTS affiliate_insert_own ON public.affiliate_links;
CREATE POLICY affiliate_insert_own ON public.affiliate_links
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND u.email_verified_at IS NOT NULL
         AND COALESCE(u.status, 'suspended') = 'active'
         AND (u.profile_completed_at IS NOT NULL OR u.kyc_status = 'approved')
    )
    AND NOT EXISTS (
      SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = auth.uid()
         AND r.name IN ('vendor_owner', 'outlet_manager')
    )
  );

CREATE OR REPLACE FUNCTION public.gen_affiliate_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, pg_temp
AS $$
DECLARE
  v_code TEXT;
  v_attempt INT := 0;
  v_vendor_ineligible BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = p_user_id
       AND u.email_verified_at IS NOT NULL
       AND COALESCE(u.status, 'suspended') = 'active'
       AND (u.profile_completed_at IS NOT NULL OR u.kyc_status = 'approved')
  ) THEN
    RAISE EXCEPTION 'profile_completion_required';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = p_user_id
       AND r.name IN ('vendor_owner', 'outlet_manager')
  ) INTO v_vendor_ineligible;

  IF v_vendor_ineligible THEN
    -- KYC approval functions call this as an admin for every approved user.
    -- Vendor KYC must still complete, but it must not create an affiliate link.
    IF p_user_id IS DISTINCT FROM auth.uid() AND public.is_admin(auth.uid()) THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'vendor_affiliate_ineligible';
  END IF;

  SELECT al.affiliate_code INTO v_code
    FROM public.affiliate_links al
   WHERE al.user_id = p_user_id AND al.is_active = TRUE
   LIMIT 1;
  IF FOUND THEN RETURN v_code; END IF;

  LOOP
    v_code := 'AF-' || upper(substring(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 6));
    BEGIN
      INSERT INTO public.affiliate_links(user_id, affiliate_code)
      VALUES (p_user_id, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 5 THEN
        RAISE EXCEPTION 'affiliate_code_collision after 5 attempts';
      END IF;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.gen_affiliate_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gen_affiliate_code(UUID) TO authenticated, service_role;

-- Clearing is allowed only to an authenticated admin or service cron, and
-- only while the commission owner's exact KYC row is locked and approved.
CREATE OR REPLACE FUNCTION public.confirm_pending_earnings()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_wallet_id UUID;
  v_amount_sen BIGINT;
  v_confirmed INT := 0;
  v_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
  IF v_role <> 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_admin(auth.uid()))
  THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  FOR v_rec IN
    SELECT
      aa.id AS attr_id,
      al.user_id AS user_id,
      ROUND(aa.commission_amount * 100)::BIGINT AS amount_sen
    FROM public.affiliate_attributions aa
    JOIN public.affiliate_clicks ac ON ac.id = aa.click_id
    JOIN public.affiliate_links al ON al.id = ac.link_id
    JOIN public.users u ON u.id = al.user_id
    WHERE aa.status = 'pending'
      AND aa.hold_until IS NOT NULL
      AND aa.hold_until <= now()
      AND u.email_verified_at IS NOT NULL
      AND COALESCE(u.status, 'suspended') = 'active'
      AND u.kyc_status = 'approved'
    FOR UPDATE OF aa, u
  LOOP
    SELECT w.id INTO v_wallet_id
      FROM public.wallets w
     WHERE w.user_id = v_rec.user_id
     FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_amount_sen := LEAST(
      v_rec.amount_sen,
      (SELECT w.pending_earnings_sen FROM public.wallets w WHERE w.id = v_wallet_id)
    );
    IF v_amount_sen <= 0 THEN CONTINUE; END IF;

    UPDATE public.wallets
       SET pending_earnings_sen = pending_earnings_sen - v_amount_sen,
           earnings_sen = earnings_sen + v_amount_sen,
           updated_at = now()
     WHERE id = v_wallet_id;

    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES
      (v_rec.user_id, v_wallet_id, 'earnings_confirm', v_amount_sen,
       'pending_earnings', 'debit', 'Commission hold cleared — moving to available'),
      (v_rec.user_id, v_wallet_id, 'earnings_confirm', v_amount_sen,
       'earnings', 'credit', 'Commission available after hold period');

    UPDATE public.affiliate_attributions
       SET status = 'confirmed', confirmed_at = now()
     WHERE id = v_rec.attr_id;
    v_confirmed := v_confirmed + 1;
  END LOOP;
  RETURN v_confirmed;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_pending_earnings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_pending_earnings() FROM anon;
REVOKE ALL ON FUNCTION public.confirm_pending_earnings() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pending_earnings() TO authenticated, service_role;

-- The current governed withdrawal RPC already checks KYC and payout readiness.
-- destination and payout readiness. Add an independent insert trigger so no
-- legacy function can create a request for a lower-tier user.
CREATE OR REPLACE FUNCTION public.enforce_progressive_withdrawal_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = NEW.user_id
       AND u.email_verified_at IS NOT NULL
       AND COALESCE(u.status, 'suspended') = 'active'
       AND u.kyc_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'kyc_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_require_progressive_tier
  ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_require_progressive_tier
  BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_progressive_withdrawal_tier();
REVOKE ALL ON FUNCTION public.enforce_progressive_withdrawal_tier() FROM PUBLIC;

-- Obsolete direct financial mutation paths are not used by the current app.
-- Keep service-only helpers for legacy internal callers, but remove public and
-- browser-session execution inherited from the old broad default grants.
REVOKE ALL ON FUNCTION public.submit_withdrawal(UUID, NUMERIC, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_withdrawal(UUID, NUMERIC, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.submit_withdrawal(UUID, NUMERIC, UUID) FROM authenticated;

REVOKE ALL ON FUNCTION public.reserve_for_withdrawal(UUID, BIGINT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_for_withdrawal(UUID, BIGINT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_for_withdrawal(UUID, BIGINT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_for_withdrawal(UUID, BIGINT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_withdrawal(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_withdrawal(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_withdrawal(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal(UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_withdrawal(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_withdrawal(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.complete_withdrawal(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal(UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_processing(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_processing(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_processing(UUID, TEXT, TEXT) FROM authenticated;

-- Future functions must opt into browser execution explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
