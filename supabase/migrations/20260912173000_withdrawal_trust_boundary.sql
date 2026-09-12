-- Make withdrawal submission and rejection server-authoritative. The former
-- authenticated RPCs remain defined for migration compatibility but cannot be
-- executed through PostgREST by application users.

REVOKE ALL ON FUNCTION public.submit_wallet_withdrawal(BIGINT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_wallet_withdrawal(UUID, TEXT, INET, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

-- E-wallet labels are server-controlled masked display data. This also keeps
-- future withdrawal snapshots from copying a historical full phone label.
CREATE OR REPLACE FUNCTION public.enforce_withdrawal_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_destination public.payout_destinations%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_user.email_verified_at IS NULL OR COALESCE(v_user.status, 'suspended') <> 'active'
     OR v_user.kyc_status <> 'approved' THEN RAISE EXCEPTION 'kyc_required'; END IF;

  SELECT * INTO v_destination FROM public.payout_destinations
   WHERE id = NEW.destination_id AND user_id = NEW.user_id FOR UPDATE;
  IF NOT FOUND OR v_destination.verification_status <> 'verified' THEN
    RAISE EXCEPTION 'payout_destination_required';
  END IF;
  IF v_destination.cooldown_until IS NOT NULL AND v_destination.cooldown_until > NOW() THEN
    RAISE EXCEPTION 'payout_destination_cooldown';
  END IF;
  IF v_destination.provider NOT IN ('stripe_connect', 'tng_direct_credit') THEN
    RAISE EXCEPTION 'payout_provider_unsupported';
  END IF;
  IF v_destination.dest_type = 'bank' AND v_destination.provider <> 'stripe_connect' THEN
    RAISE EXCEPTION 'payout_provider_unsupported';
  END IF;
  IF v_destination.dest_type = 'ewallet' AND v_destination.provider <> 'tng_direct_credit' THEN
    RAISE EXCEPTION 'payout_provider_unsupported';
  END IF;

  NEW.destination_label := CASE
    WHEN v_destination.dest_type = 'ewallet'
      THEN CONCAT('TNG eWallet ', COALESCE(v_destination.masked_ref, ''))
    ELSE COALESCE(v_destination.label, 'Verified payout destination')
  END;
  NEW.destination_provider := v_destination.provider;
  NEW.destination_provider_reference := v_destination.provider_reference;
  NEW.destination_masked_ref := v_destination.masked_ref;
  NEW.payout_provider := v_destination.provider;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_withdrawal_eligibility() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.submit_wallet_withdrawal_server(
  p_user_id UUID,
  p_request_id UUID,
  p_amount_sen BIGINT,
  p_destination_id UUID,
  p_expected_tng_phone TEXT,
  p_expected_provider_reference TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_wallet public.wallets%ROWTYPE;
  v_destination public.payout_destinations%ROWTYPE;
  v_existing public.withdrawal_requests%ROWTYPE;
  v_min_amount_sen BIGINT;
  v_dual_threshold_sen BIGINT;
  v_dual BOOLEAN;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id_required'; END IF;
  IF p_destination_id IS NULL THEN RAISE EXCEPTION 'payout_destination_required'; END IF;
  IF p_amount_sen IS NULL OR p_amount_sen <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;

  SELECT email_verified_at, status, kyc_status, stripe_connect_account_id,
         stripe_payouts_enabled, phone, phone_verified_at
    INTO v_user
    FROM public.users
   WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_user.email_verified_at IS NULL OR COALESCE(v_user.status, 'suspended') <> 'active'
     OR v_user.kyc_status <> 'approved' THEN RAISE EXCEPTION 'kyc_required'; END IF;

  SELECT * INTO v_existing
    FROM public.withdrawal_requests
   WHERE id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.user_id <> p_user_id
       OR ROUND(v_existing.amount * 100)::BIGINT <> p_amount_sen
       OR v_existing.destination_id IS DISTINCT FROM p_destination_id THEN
      RAISE EXCEPTION 'withdrawal_request_id_conflict';
    END IF;
    RETURN jsonb_build_object(
      'request_id', v_existing.id,
      'requires_dual_approval', v_existing.requires_dual_approval,
      'status', v_existing.status,
      'replayed', true
    );
  END IF;

  SELECT * INTO v_destination
    FROM public.payout_destinations
   WHERE id = p_destination_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_destination.verification_status <> 'verified' THEN
    RAISE EXCEPTION 'payout_destination_required';
  END IF;
  IF v_destination.cooldown_until IS NOT NULL AND v_destination.cooldown_until > NOW() THEN
    RAISE EXCEPTION 'payout_destination_cooldown';
  END IF;

  IF v_destination.dest_type = 'ewallet' THEN
    IF v_destination.provider <> 'tng_direct_credit' THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
    IF v_user.phone_verified_at IS NULL
       OR NULLIF(BTRIM(COALESCE(p_expected_tng_phone, '')), '') IS NULL
       OR v_user.phone IS DISTINCT FROM p_expected_tng_phone
       OR NULLIF(BTRIM(COALESCE(p_expected_provider_reference, '')), '') IS NULL
       OR v_destination.provider_reference IS DISTINCT FROM p_expected_provider_reference THEN
      RAISE EXCEPTION 'payout_destination_identity_mismatch';
    END IF;
  ELSIF v_destination.dest_type = 'bank' THEN
    IF v_destination.provider <> 'stripe_connect'
       OR v_user.stripe_connect_account_id IS NULL
       OR NOT COALESCE(v_user.stripe_payouts_enabled, FALSE) THEN
      RAISE EXCEPTION 'payout_account_required';
    END IF;
    IF p_expected_tng_phone IS NOT NULL OR p_expected_provider_reference IS NOT NULL THEN
      RAISE EXCEPTION 'payout_destination_identity_mismatch';
    END IF;
  ELSE
    RAISE EXCEPTION 'payout_provider_unsupported';
  END IF;

  SELECT COALESCE(value::BIGINT, 5000) INTO v_min_amount_sen
    FROM public.platform_settings WHERE key = 'withdrawal.min_amount_sen';
  IF p_amount_sen < COALESCE(v_min_amount_sen, 5000) THEN RAISE EXCEPTION 'below_min_withdrawal'; END IF;
  SELECT COALESCE(value::BIGINT, 50000) INTO v_dual_threshold_sen
    FROM public.platform_settings WHERE key = 'withdrawal.dual_approval_threshold_sen';
  v_dual := p_amount_sen >= COALESCE(v_dual_threshold_sen, 50000);

  IF EXISTS (
    SELECT 1 FROM public.withdrawal_requests wr
     WHERE wr.user_id = p_user_id
       AND wr.status IN ('pending', 'pending_second_approval', 'approved', 'processing', 'hold', 'overdue')
     FOR UPDATE
  ) THEN RAISE EXCEPTION 'active_withdrawal_exists'; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_wallet.earnings_sen < p_amount_sen THEN RAISE EXCEPTION 'insufficient_earnings'; END IF;

  INSERT INTO public.withdrawal_requests
    (id, user_id, wallet_id, destination_id, amount, destination_label, status, requires_dual_approval)
  VALUES (
    p_request_id, p_user_id, v_wallet.id, v_destination.id, p_amount_sen::NUMERIC / 100,
    CASE WHEN v_destination.dest_type = 'ewallet'
      THEN CONCAT('TNG eWallet ', COALESCE(v_destination.masked_ref, ''))
      ELSE COALESCE(v_destination.label, 'Verified payout destination') END,
    'pending', v_dual
  );

  UPDATE public.wallets
     SET earnings_sen = earnings_sen - p_amount_sen,
         reserved_earnings_sen = reserved_earnings_sen + p_amount_sen,
         updated_at = NOW()
   WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions(user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES (p_user_id, v_wallet.id, 'withdrawal_reserve', p_amount_sen, 'earnings', 'debit', p_request_id,
    'Withdrawal reserved — pending review');
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    p_user_id, 'withdrawal.submitted', 'withdrawal', p_request_id,
    jsonb_build_object('earnings_sen', v_wallet.earnings_sen, 'reserved_earnings_sen', v_wallet.reserved_earnings_sen),
    jsonb_build_object('earnings_sen', v_wallet.earnings_sen - p_amount_sen,
      'reserved_earnings_sen', v_wallet.reserved_earnings_sen + p_amount_sen),
    'Customer submitted withdrawal request'
  );
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (p_user_id, 'withdrawal_submitted', 'Withdrawal request submitted',
    'Your withdrawal is pending review. You will receive an update when its status changes.', '/customer/wallet');

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'requires_dual_approval', v_dual,
    'status', 'pending',
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_wallet_withdrawal_server(UUID, UUID, BIGINT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_wallet_withdrawal_server(UUID, UUID, BIGINT, UUID, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reject_wallet_withdrawal_server(
  p_actor_id UUID,
  p_id UUID,
  p_reason TEXT,
  p_ip INET,
  p_reason_category TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_amount_sen BIGINT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_actor_id IS NULL OR NOT public.is_approver(p_actor_id) THEN RAISE EXCEPTION 'approver_required'; END IF;
  IF char_length(BTRIM(COALESCE(p_reason, ''))) < 10 OR char_length(BTRIM(p_reason)) > 500 THEN
    RAISE EXCEPTION 'withdrawal_reason_invalid';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason_category, '')), '') IS NULL THEN
    RAISE EXCEPTION 'reason_category_required';
  END IF;

  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = p_actor_id THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status NOT IN ('pending', 'pending_second_approval', 'approved', 'hold', 'overdue') THEN
    RAISE EXCEPTION 'withdrawal_not_rejectable';
  END IF;

  v_amount_sen := ROUND(v_request.amount * 100)::BIGINT;
  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_request.wallet_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.reserved_earnings_sen < v_amount_sen THEN
    RAISE EXCEPTION 'withdrawal_reserve_missing';
  END IF;

  INSERT INTO public.withdrawal_approvals(request_id, approver_id, action, note, approval_cycle, reason_category)
  VALUES (p_id, p_actor_id, 'reject', p_reason, v_request.approval_cycle, p_reason_category);
  UPDATE public.wallets
     SET earnings_sen = earnings_sen + v_amount_sen,
         reserved_earnings_sen = reserved_earnings_sen - v_amount_sen,
         updated_at = NOW()
   WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions(user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES (v_request.user_id, v_wallet.id, 'withdrawal_cancel', v_amount_sen, 'earnings', 'credit', p_id, p_reason);
  UPDATE public.withdrawal_requests
     SET status = 'rejected', customer_reason = p_reason,
         customer_reason_category = p_reason_category,
         customer_visible_at = NOW(), updated_at = NOW()
   WHERE id = p_id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note)
  VALUES (
    p_actor_id, 'withdrawal.rejected', 'withdrawal', p_id,
    jsonb_build_object('status', v_request.status, 'approval_cycle', v_request.approval_cycle),
    jsonb_build_object('status', 'rejected', 'approval_cycle', v_request.approval_cycle),
    p_ip, p_reason
  );
  INSERT INTO public.notifications(user_id, type, title, body, link, event_key, category, metadata)
  VALUES (
    v_request.user_id, 'withdrawal_rejected', 'Withdrawal request rejected', p_reason,
    '/customer/wallet', 'withdrawal_rejected:' || p_id::text || ':' || v_request.approval_cycle::text,
    'wallet', jsonb_build_object('withdrawal_id', p_id)
  );
  RETURN jsonb_build_object(
    'user_id', v_request.user_id,
    'amount_rm', v_request.amount,
    'status', 'rejected',
    'approval_cycle', v_request.approval_cycle
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_wallet_withdrawal_server(UUID, UUID, TEXT, INET, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_wallet_withdrawal_server(UUID, UUID, TEXT, INET, TEXT)
  TO service_role;

-- Provider references are never browser-readable. Existing authenticated list
-- clients retain only their explicit customer-safe withdrawal projection.
REVOKE SELECT ON TABLE public.payout_destinations FROM authenticated;
REVOKE SELECT ON TABLE public.withdrawal_requests FROM authenticated;
GRANT SELECT (
  id, user_id, amount, status, requires_dual_approval, destination_label, created_at
) ON TABLE public.withdrawal_requests TO authenticated;

NOTIFY pgrst, 'reload schema';
