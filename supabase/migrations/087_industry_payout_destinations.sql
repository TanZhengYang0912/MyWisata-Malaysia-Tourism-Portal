-- Industry payout destination lifecycle, immutable withdrawal snapshots,
-- and provider failure metadata. No payment PIN or provider credential is stored.

ALTER TABLE public.payout_destinations
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS destination_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS destination_provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS destination_masked_ref VARCHAR(80),
  ADD COLUMN IF NOT EXISTS payout_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payout_provider_event_id TEXT,
  ADD COLUMN IF NOT EXISTS payout_failure_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS payout_failure_message TEXT,
  ADD COLUMN IF NOT EXISTS payout_failure_category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payout_failure_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_failure_retryable BOOLEAN;

ALTER TABLE public.withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_payout_failure_category_check;
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_payout_failure_category_check
  CHECK (payout_failure_category IS NULL OR payout_failure_category IN (
    'invalid_destination', 'account_disabled', 'provider_rejected',
    'timeout', 'not_configured', 'unknown'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_provider_event_unique
  ON public.withdrawal_requests (payout_provider, payout_provider_event_id)
  WHERE payout_provider_event_id IS NOT NULL;

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
  IF v_user.phone_verified_at IS NULL THEN RAISE EXCEPTION 'phone_verification_required'; END IF;
  IF v_user.kyc_status <> 'approved' THEN RAISE EXCEPTION 'kyc_required'; END IF;

  SELECT * INTO v_destination
    FROM public.payout_destinations
   WHERE id = NEW.destination_id AND user_id = NEW.user_id
   FOR UPDATE;
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

  NEW.destination_label := COALESCE(v_destination.label, 'Verified payout destination');
  NEW.destination_provider := v_destination.provider;
  NEW.destination_provider_reference := v_destination.provider_reference;
  NEW.destination_masked_ref := v_destination.masked_ref;
  NEW.payout_provider := v_destination.provider;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_require_verified_destination ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_require_verified_destination
  BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_withdrawal_eligibility();

CREATE OR REPLACE FUNCTION public.submit_wallet_withdrawal(
  p_amount_sen BIGINT,
  p_destination_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user RECORD;
  v_wallet public.wallets%ROWTYPE;
  v_destination public.payout_destinations%ROWTYPE;
  v_min_amount_sen BIGINT;
  v_dual_threshold_sen BIGINT;
  v_request_id UUID;
  v_dual BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_amount_sen IS NULL OR p_amount_sen <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;

  SELECT tier, kyc_status, phone_verified_at, stripe_connect_account_id, stripe_payouts_enabled
    INTO v_user FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_user.phone_verified_at IS NULL THEN RAISE EXCEPTION 'phone_verification_required'; END IF;
  IF v_user.tier <> 'kyc_verified' OR v_user.kyc_status <> 'approved' THEN RAISE EXCEPTION 'kyc_required'; END IF;

  SELECT * INTO v_destination
    FROM public.payout_destinations
   WHERE id = p_destination_id AND user_id = v_user_id
   FOR UPDATE;
  IF NOT FOUND OR v_destination.verification_status <> 'verified' THEN RAISE EXCEPTION 'payout_destination_required'; END IF;
  IF v_destination.cooldown_until IS NOT NULL AND v_destination.cooldown_until > NOW() THEN RAISE EXCEPTION 'payout_destination_cooldown'; END IF;
  IF v_destination.provider NOT IN ('stripe_connect', 'tng_direct_credit') THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
  IF v_destination.dest_type = 'bank' AND (v_destination.provider <> 'stripe_connect' OR v_user.stripe_connect_account_id IS NULL OR NOT COALESCE(v_user.stripe_payouts_enabled, false)) THEN
    RAISE EXCEPTION 'payout_account_required';
  END IF;

  SELECT COALESCE(value::BIGINT, 5000) INTO v_min_amount_sen FROM public.platform_settings WHERE key = 'withdrawal.min_amount_sen';
  IF p_amount_sen < COALESCE(v_min_amount_sen, 5000) THEN RAISE EXCEPTION 'below_min_withdrawal'; END IF;
  SELECT COALESCE(value::BIGINT, 50000) INTO v_dual_threshold_sen FROM public.platform_settings WHERE key = 'withdrawal.dual_approval_threshold_sen';
  v_dual := p_amount_sen >= COALESCE(v_dual_threshold_sen, 50000);

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_wallet.earnings_sen < p_amount_sen THEN RAISE EXCEPTION 'insufficient_earnings'; END IF;

  BEGIN
    INSERT INTO public.withdrawal_requests
      (user_id, wallet_id, destination_id, amount, destination_label, status, requires_dual_approval)
    VALUES
      (v_user_id, v_wallet.id, v_destination.id, p_amount_sen::NUMERIC / 100, COALESCE(v_destination.label, 'Verified payout destination'), 'pending', v_dual)
    RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'active_withdrawal_exists';
  END;

  UPDATE public.wallets SET earnings_sen = earnings_sen - p_amount_sen, reserved_earnings_sen = reserved_earnings_sen + p_amount_sen, updated_at = NOW() WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES (v_user_id, v_wallet.id, 'withdrawal_reserve', p_amount_sen, 'earnings', 'debit', v_request_id, 'Withdrawal reserved — pending review');
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (v_user_id, 'withdrawal.submitted', 'withdrawal', v_request_id,
    jsonb_build_object('earnings_sen', v_wallet.earnings_sen, 'reserved_earnings_sen', v_wallet.reserved_earnings_sen),
    jsonb_build_object('earnings_sen', v_wallet.earnings_sen - p_amount_sen, 'reserved_earnings_sen', v_wallet.reserved_earnings_sen + p_amount_sen),
    'Customer submitted withdrawal request');
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_user_id, 'withdrawal_submitted', 'Withdrawal request submitted', 'Your withdrawal is pending review. You will receive an update when its status changes.', '/customer/wallet');
  RETURN jsonb_build_object('request_id', v_request_id, 'requires_dual_approval', v_dual, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_wallet_withdrawal(BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_wallet_withdrawal(BIGINT, UUID) TO authenticated;
