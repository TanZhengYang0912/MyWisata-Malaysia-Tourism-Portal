-- Enforce independent customer capability facts at every money/trust write.
-- Dynamic policy may restrict these paths further but cannot bypass them.

CREATE OR REPLACE FUNCTION public.customer_is_active_email_verified(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = p_user_id
      AND u.email_verified_at IS NOT NULL
      AND COALESCE(u.status, 'suspended') = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.customer_is_active_email_verified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_is_active_email_verified(UUID) TO authenticated, service_role;

-- Commerce remains Phone-gated, including service-role writes for a subject.
CREATE OR REPLACE FUNCTION public.enforce_phone_verified_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'checkout_auth_required'; END IF;
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = NEW.user_id
      AND u.email_verified_at IS NOT NULL
      AND u.phone_verified_at IS NOT NULL
      AND COALESCE(u.status, 'suspended') = 'active'
  ) THEN RAISE EXCEPTION 'phone_verification_required'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_phone_verified_order() FROM PUBLIC;
DROP TRIGGER IF EXISTS orders_require_phone_verification ON public.orders;
CREATE TRIGGER orders_require_phone_verification BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_phone_verified_order();

CREATE OR REPLACE FUNCTION public.enforce_phone_verified_booking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND (auth.uid() IS NULL OR NEW.customer_id IS DISTINCT FROM auth.uid())
  THEN RAISE EXCEPTION 'booking_not_owned'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = NEW.customer_id
      AND u.email_verified_at IS NOT NULL
      AND u.phone_verified_at IS NOT NULL
      AND COALESCE(u.status, 'suspended') = 'active'
  ) THEN RAISE EXCEPTION 'phone_verification_required'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_phone_verified_booking() FROM PUBLIC;
DROP TRIGGER IF EXISTS bookings_require_phone_verification ON public.bookings;
CREATE TRIGGER bookings_require_phone_verification BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_phone_verified_booking();

-- Recommendation submission is available through either independent path.
CREATE OR REPLACE FUNCTION public.customer_can_submit_recommendation(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = p_user_id
      AND u.email_verified_at IS NOT NULL
      AND COALESCE(u.status, 'suspended') = 'active'
      AND (u.profile_completed_at IS NOT NULL OR u.kyc_status = 'approved')
  );
$$;
REVOKE ALL ON FUNCTION public.customer_can_submit_recommendation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_can_submit_recommendation(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_recommendation_profile_or_kyc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND (auth.uid() IS NULL OR NEW.recommender_id IS DISTINCT FROM auth.uid())
  THEN RAISE EXCEPTION 'recommendation_not_owned'; END IF;
  IF NOT public.customer_can_submit_recommendation(NEW.recommender_id) THEN
    RAISE EXCEPTION 'profile_or_kyc_required';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_recommendation_profile_or_kyc() FROM PUBLIC;
DROP TRIGGER IF EXISTS vendor_recommendations_require_profile_complete ON public.vendor_recommendations;
DROP TRIGGER IF EXISTS vendor_recommendations_require_profile_or_kyc ON public.vendor_recommendations;
CREATE TRIGGER vendor_recommendations_require_profile_or_kyc
  BEFORE INSERT ON public.vendor_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_recommendation_profile_or_kyc();
DROP POLICY IF EXISTS vendor_rec_insert_own ON public.vendor_recommendations;
CREATE POLICY vendor_rec_insert_own ON public.vendor_recommendations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = recommender_id AND public.customer_can_submit_recommendation(auth.uid()));

-- Full affiliate always wins over Limited; vendor/outlet staff remain excluded.
CREATE OR REPLACE FUNCTION public.customer_affiliate_mode(p_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = p_user_id AND r.name IN ('vendor_owner', 'outlet_manager')
    ) THEN 'none'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = p_user_id AND r.name = 'customer'
    ) THEN 'none'
    ELSE COALESCE((
      SELECT CASE
        WHEN u.kyc_status = 'approved' THEN 'full'
        WHEN u.profile_completed_at IS NOT NULL THEN 'limited'
        ELSE 'none'
      END
      FROM public.users u WHERE u.id = p_user_id
        AND u.email_verified_at IS NOT NULL
        AND COALESCE(u.status, 'suspended') = 'active'
    ), 'none')
  END;
$$;
REVOKE ALL ON FUNCTION public.customer_affiliate_mode(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_affiliate_mode(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_affiliate_link_eligibility()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.customer_affiliate_mode(NEW.user_id) = 'none' THEN
    RAISE EXCEPTION 'affiliate_not_eligible';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_affiliate_link_eligibility() FROM PUBLIC;
DROP TRIGGER IF EXISTS affiliate_links_require_eligible_profile ON public.affiliate_links;
CREATE TRIGGER affiliate_links_require_eligible_profile BEFORE INSERT ON public.affiliate_links
  FOR EACH ROW EXECUTE FUNCTION public.enforce_affiliate_link_eligibility();
DROP POLICY IF EXISTS affiliate_insert_own ON public.affiliate_links;
CREATE POLICY affiliate_insert_own ON public.affiliate_links FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.customer_affiliate_mode(auth.uid()) IN ('limited', 'full'));

CREATE OR REPLACE FUNCTION public.gen_affiliate_code(p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE v_code TEXT; v_attempt INTEGER := 0; v_mode TEXT;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_mode := public.customer_affiliate_mode(p_user_id);
  IF v_mode = 'none' THEN
    IF p_user_id IS DISTINCT FROM auth.uid() AND public.is_admin(auth.uid()) THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'affiliate_not_eligible';
  END IF;
  SELECT al.affiliate_code INTO v_code FROM public.affiliate_links al
    WHERE al.user_id = p_user_id AND al.is_active = TRUE LIMIT 1;
  IF FOUND THEN RETURN v_code; END IF;
  LOOP
    v_code := 'AF-' || upper(substring(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 6));
    BEGIN
      INSERT INTO public.affiliate_links(user_id, affiliate_code) VALUES (p_user_id, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 5 THEN RAISE EXCEPTION 'affiliate_code_collision after 5 attempts'; END IF;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.gen_affiliate_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gen_affiliate_code(UUID) TO authenticated, service_role;

-- The Admin/service actor is authorized separately; every commission subject
-- is rechecked for approved KYC while attribution and user rows are locked.
CREATE OR REPLACE FUNCTION public.confirm_pending_earnings()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec RECORD; v_wallet_id UUID; v_amount_sen BIGINT; v_confirmed INTEGER := 0;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_admin(auth.uid()))
  THEN RAISE EXCEPTION 'admin_required'; END IF;
  FOR v_rec IN
    SELECT aa.id AS attr_id, al.user_id, ROUND(aa.commission_amount * 100)::BIGINT AS amount_sen
      FROM public.affiliate_attributions aa
      JOIN public.affiliate_clicks ac ON ac.id = aa.click_id
      JOIN public.affiliate_links al ON al.id = ac.link_id
      JOIN public.users u ON u.id = al.user_id
     WHERE aa.status = 'pending' AND aa.hold_until IS NOT NULL AND aa.hold_until <= NOW()
       AND u.email_verified_at IS NOT NULL
       AND COALESCE(u.status, 'suspended') = 'active'
       AND u.kyc_status = 'approved'
       AND EXISTS (
         SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
         WHERE ur.user_id = al.user_id AND r.name = 'customer'
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
         WHERE ur.user_id = al.user_id AND r.name IN ('vendor_owner', 'outlet_manager')
       )
     FOR UPDATE OF aa, u
  LOOP
    SELECT w.id INTO v_wallet_id FROM public.wallets w WHERE w.user_id = v_rec.user_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_amount_sen := LEAST(v_rec.amount_sen,
      (SELECT w.pending_earnings_sen FROM public.wallets w WHERE w.id = v_wallet_id));
    IF v_amount_sen <= 0 THEN CONTINUE; END IF;
    UPDATE public.wallets SET pending_earnings_sen = pending_earnings_sen - v_amount_sen,
      earnings_sen = earnings_sen + v_amount_sen, updated_at = NOW() WHERE id = v_wallet_id;
    INSERT INTO public.wallet_transactions(user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES
      (v_rec.user_id, v_wallet_id, 'earnings_confirm', v_amount_sen, 'pending_earnings', 'debit', 'Commission hold cleared — moving to available'),
      (v_rec.user_id, v_wallet_id, 'earnings_confirm', v_amount_sen, 'earnings', 'credit', 'Commission available after hold period');
    UPDATE public.affiliate_attributions SET status = 'confirmed', confirmed_at = NOW() WHERE id = v_rec.attr_id;
    v_confirmed := v_confirmed + 1;
  END LOOP;
  RETURN v_confirmed;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_pending_earnings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pending_earnings() TO authenticated, service_role;

-- Withdrawal requires KYC plus transaction-local payout and balance readiness.
-- Phone, Profile completion, and legacy tier are intentionally absent.
CREATE OR REPLACE FUNCTION public.enforce_withdrawal_eligibility()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user public.users%ROWTYPE; v_destination public.payout_destinations%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_user.email_verified_at IS NULL OR COALESCE(v_user.status, 'suspended') <> 'active'
     OR v_user.kyc_status <> 'approved' THEN RAISE EXCEPTION 'kyc_required'; END IF;
  SELECT * INTO v_destination FROM public.payout_destinations
    WHERE id = NEW.destination_id AND user_id = NEW.user_id FOR UPDATE;
  IF NOT FOUND OR v_destination.verification_status <> 'verified' THEN RAISE EXCEPTION 'payout_destination_required'; END IF;
  IF v_destination.cooldown_until IS NOT NULL AND v_destination.cooldown_until > NOW() THEN RAISE EXCEPTION 'payout_destination_cooldown'; END IF;
  IF v_destination.provider NOT IN ('stripe_connect', 'tng_direct_credit') THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
  IF v_destination.dest_type = 'bank' AND v_destination.provider <> 'stripe_connect' THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
  IF v_destination.dest_type = 'ewallet' AND v_destination.provider <> 'tng_direct_credit' THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
  NEW.destination_label := COALESCE(v_destination.label, 'Verified payout destination');
  NEW.destination_provider := v_destination.provider;
  NEW.destination_provider_reference := v_destination.provider_reference;
  NEW.destination_masked_ref := v_destination.masked_ref;
  NEW.payout_provider := v_destination.provider;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_withdrawal_eligibility() FROM PUBLIC;
DROP TRIGGER IF EXISTS withdrawal_require_progressive_tier ON public.withdrawal_requests;
DROP TRIGGER IF EXISTS withdrawal_require_verified_destination ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_require_verified_destination BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_withdrawal_eligibility();

CREATE OR REPLACE FUNCTION public.submit_wallet_withdrawal(p_amount_sen BIGINT, p_destination_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid(); v_user RECORD; v_wallet public.wallets%ROWTYPE;
  v_destination public.payout_destinations%ROWTYPE; v_min_amount_sen BIGINT;
  v_dual_threshold_sen BIGINT; v_request_id UUID; v_dual BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_amount_sen IS NULL OR p_amount_sen <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;
  SELECT email_verified_at, status, kyc_status, stripe_connect_account_id, stripe_payouts_enabled
    INTO v_user FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_user.email_verified_at IS NULL OR COALESCE(v_user.status, 'suspended') <> 'active'
     OR v_user.kyc_status <> 'approved' THEN RAISE EXCEPTION 'kyc_required'; END IF;
  SELECT * INTO v_destination FROM public.payout_destinations
    WHERE id = p_destination_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND OR v_destination.verification_status <> 'verified' THEN RAISE EXCEPTION 'payout_destination_required'; END IF;
  IF v_destination.cooldown_until IS NOT NULL AND v_destination.cooldown_until > NOW() THEN RAISE EXCEPTION 'payout_destination_cooldown'; END IF;
  IF v_destination.provider NOT IN ('stripe_connect', 'tng_direct_credit') THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
  IF v_destination.dest_type = 'bank' AND (v_destination.provider <> 'stripe_connect'
       OR v_user.stripe_connect_account_id IS NULL OR NOT COALESCE(v_user.stripe_payouts_enabled, FALSE))
  THEN RAISE EXCEPTION 'payout_account_required'; END IF;
  SELECT COALESCE(value::BIGINT, 5000) INTO v_min_amount_sen
    FROM public.platform_settings WHERE key = 'withdrawal.min_amount_sen';
  IF p_amount_sen < COALESCE(v_min_amount_sen, 5000) THEN RAISE EXCEPTION 'below_min_withdrawal'; END IF;
  SELECT COALESCE(value::BIGINT, 50000) INTO v_dual_threshold_sen
    FROM public.platform_settings WHERE key = 'withdrawal.dual_approval_threshold_sen';
  v_dual := p_amount_sen >= COALESCE(v_dual_threshold_sen, 50000);
  IF EXISTS (
    SELECT 1 FROM public.withdrawal_requests wr WHERE wr.user_id = v_user_id
      AND wr.status IN ('pending', 'pending_second_approval', 'approved', 'processing', 'hold', 'overdue') FOR UPDATE
  ) THEN RAISE EXCEPTION 'active_withdrawal_exists'; END IF;
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_wallet.earnings_sen < p_amount_sen THEN RAISE EXCEPTION 'insufficient_earnings'; END IF;
  BEGIN
    INSERT INTO public.withdrawal_requests
      (user_id, wallet_id, destination_id, amount, destination_label, status, requires_dual_approval)
    VALUES (v_user_id, v_wallet.id, v_destination.id, p_amount_sen::NUMERIC / 100,
      COALESCE(v_destination.label, 'Verified payout destination'), 'pending', v_dual)
    RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'active_withdrawal_exists';
  END;
  UPDATE public.wallets SET earnings_sen = earnings_sen - p_amount_sen,
    reserved_earnings_sen = reserved_earnings_sen + p_amount_sen, updated_at = NOW()
    WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions(user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES (v_user_id, v_wallet.id, 'withdrawal_reserve', p_amount_sen, 'earnings', 'debit', v_request_id,
    'Withdrawal reserved — pending review');
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (v_user_id, 'withdrawal.submitted', 'withdrawal', v_request_id,
    jsonb_build_object('earnings_sen', v_wallet.earnings_sen, 'reserved_earnings_sen', v_wallet.reserved_earnings_sen),
    jsonb_build_object('earnings_sen', v_wallet.earnings_sen - p_amount_sen,
      'reserved_earnings_sen', v_wallet.reserved_earnings_sen + p_amount_sen),
    'Customer submitted withdrawal request');
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_user_id, 'withdrawal_submitted', 'Withdrawal request submitted',
    'Your withdrawal is pending review. You will receive an update when its status changes.', '/customer/wallet');
  RETURN jsonb_build_object('request_id', v_request_id, 'requires_dual_approval', v_dual, 'status', 'pending');
END;
$$;
REVOKE ALL ON FUNCTION public.submit_wallet_withdrawal(BIGINT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_wallet_withdrawal(BIGINT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_wallet_withdrawal(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_wallet_withdrawal(BIGINT) FROM anon;
REVOKE ALL ON FUNCTION public.submit_wallet_withdrawal(BIGINT) FROM authenticated;

-- Admin approval/completion functions are intentionally not replaced here.
-- Existing approver-only, valid-state, self-dealing, idempotency, risk, and
-- requires_dual_approval protections remain authoritative and unchanged.

NOTIFY pgrst, 'reload schema';
