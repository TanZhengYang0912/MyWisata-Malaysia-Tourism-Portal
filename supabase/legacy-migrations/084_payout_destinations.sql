-- Real payout destination metadata and atomic wallet-first checkout reservations.

ALTER TABLE public.payout_destinations
  ADD COLUMN IF NOT EXISTS provider VARCHAR(50) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.payout_destinations
  DROP CONSTRAINT IF EXISTS payout_destinations_verification_status_check;
ALTER TABLE public.payout_destinations
  ADD CONSTRAINT payout_destinations_verification_status_check
  CHECK (verification_status IN ('pending','verified','disabled','failed'));

CREATE UNIQUE INDEX IF NOT EXISTS payout_destinations_user_provider_reference_unique
  ON public.payout_destinations (user_id, provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.checkout_wallet_reservations (
  checkout_session_id UUID PRIMARY KEY REFERENCES public.checkout_sessions(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  wallet_id          UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  topup_amount_sen   BIGINT NOT NULL DEFAULT 0 CHECK (topup_amount_sen >= 0),
  earnings_amount_sen BIGINT NOT NULL DEFAULT 0 CHECK (earnings_amount_sen >= 0),
  status             VARCHAR(20) NOT NULL DEFAULT 'reserved'
                       CHECK (status IN ('reserved','committed','released')),
  idempotency_key    TEXT NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.checkout_wallet_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS checkout_wallet_reservations_owner_read ON public.checkout_wallet_reservations;
CREATE POLICY checkout_wallet_reservations_owner_read ON public.checkout_wallet_reservations
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin(auth.uid()));

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
  IF NOT (v_user.phone_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'phone_verification_required'; END IF;
  IF v_user.kyc_status <> 'approved' THEN RAISE EXCEPTION 'kyc_required'; END IF;

  IF NEW.destination_id IS NULL AND v_user.stripe_connect_account_id IS NOT NULL
     AND COALESCE(v_user.stripe_payouts_enabled, false) THEN
    INSERT INTO public.payout_destinations
      (user_id, dest_type, label, masked_ref, is_default, provider, provider_reference, verification_status, updated_at)
    VALUES
      (NEW.user_id, 'bank', 'Stripe Connect bank account', 'Bank account on file', true, 'stripe_connect', v_user.stripe_connect_account_id, 'verified', NOW())
    ON CONFLICT (user_id, provider, provider_reference) WHERE provider_reference IS NOT NULL
    DO UPDATE SET verification_status = 'verified', is_default = true, updated_at = NOW()
    RETURNING * INTO v_destination;
    NEW.destination_id := v_destination.id;
    NEW.destination_label := v_destination.label;
  ELSE
    SELECT * INTO v_destination
      FROM public.payout_destinations
     WHERE id = NEW.destination_id AND user_id = NEW.user_id
     FOR UPDATE;
    IF NOT FOUND OR v_destination.verification_status <> 'verified' THEN
      RAISE EXCEPTION 'payout_destination_required';
    END IF;
    IF v_destination.dest_type = 'ewallet' THEN
      RAISE EXCEPTION 'payout_provider_unsupported';
    END IF;
    NEW.destination_label := COALESCE(v_destination.label, 'Verified bank account');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_require_verified_destination ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_require_verified_destination
  BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_withdrawal_eligibility();

-- Destination-aware overload. The legacy one-argument RPC remains available for
-- older clients; new callers pass the verified destination selected in the UI.
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
  IF NOT (v_user.phone_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'phone_verification_required'; END IF;
  IF v_user.tier <> 'kyc_verified' OR v_user.kyc_status <> 'approved' THEN RAISE EXCEPTION 'kyc_required'; END IF;
  IF v_user.stripe_connect_account_id IS NULL OR NOT COALESCE(v_user.stripe_payouts_enabled, false) THEN RAISE EXCEPTION 'payout_account_required'; END IF;

  SELECT * INTO v_destination
    FROM public.payout_destinations
   WHERE id = p_destination_id AND user_id = v_user_id
   FOR UPDATE;
  IF NOT FOUND OR v_destination.verification_status <> 'verified' THEN RAISE EXCEPTION 'payout_destination_required'; END IF;
  IF v_destination.dest_type = 'ewallet' OR v_destination.provider <> 'stripe_connect' THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;

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
      (v_user_id, v_wallet.id, v_destination.id, p_amount_sen::NUMERIC / 100, COALESCE(v_destination.label, 'Verified bank account'), 'pending', v_dual)
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

CREATE OR REPLACE FUNCTION public.reserve_wallet_split_checkout(p_checkout_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session public.checkout_sessions%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_existing public.checkout_wallet_reservations%ROWTYPE;
  v_total_sen BIGINT;
  v_wallet_sen BIGINT;
  v_topup_sen BIGINT;
  v_earnings_sen BIGINT;
BEGIN
  SELECT * INTO v_session FROM public.checkout_sessions WHERE id = p_checkout_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_session_not_found'; END IF;
  IF v_user IS NOT NULL AND v_session.user_id <> v_user THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;

  SELECT * INTO v_existing FROM public.checkout_wallet_reservations WHERE checkout_session_id = p_checkout_session_id FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('checkout_session_id', p_checkout_session_id, 'wallet_amount_sen', v_existing.topup_amount_sen + v_existing.earnings_amount_sen, 'external_amount_sen', ROUND(v_session.total_amount * 100)::BIGINT - v_existing.topup_amount_sen - v_existing.earnings_amount_sen, 'status', v_existing.status);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_session.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  v_total_sen := ROUND(v_session.total_amount * 100)::BIGINT;
  v_wallet_sen := LEAST(v_total_sen, v_wallet.topup_sen + v_wallet.earnings_sen);
  v_topup_sen := LEAST(v_wallet.topup_sen, v_wallet_sen);
  v_earnings_sen := v_wallet_sen - v_topup_sen;

  UPDATE public.wallets
     SET topup_sen = topup_sen - v_topup_sen,
         earnings_sen = earnings_sen - v_earnings_sen,
         updated_at = NOW()
   WHERE id = v_wallet.id;

  INSERT INTO public.checkout_wallet_reservations
    (checkout_session_id, user_id, wallet_id, topup_amount_sen, earnings_amount_sen, idempotency_key)
  VALUES
    (p_checkout_session_id, v_session.user_id, v_wallet.id, v_topup_sen, v_earnings_sen, 'wallet-split:' || p_checkout_session_id::TEXT);
  IF v_topup_sen > 0 THEN
    INSERT INTO public.wallet_transactions (user_id, wallet_id, order_id, idempotency_key, type, amount_sen, bucket, direction, note)
    VALUES (v_session.user_id, v_wallet.id, v_session.order_id, 'wallet-split-reserve:' || p_checkout_session_id::TEXT || ':topup', 'spend', v_topup_sen, 'topup', 'debit', 'Wallet split-payment reservation') ON CONFLICT DO NOTHING;
  END IF;
  IF v_earnings_sen > 0 THEN
    INSERT INTO public.wallet_transactions (user_id, wallet_id, order_id, idempotency_key, type, amount_sen, bucket, direction, note)
    VALUES (v_session.user_id, v_wallet.id, v_session.order_id, 'wallet-split-reserve:' || p_checkout_session_id::TEXT || ':earnings', 'spend', v_earnings_sen, 'earnings', 'debit', 'Wallet split-payment reservation') ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.checkout_sessions SET payment_method = 'wallet_split', updated_at = NOW() WHERE id = p_checkout_session_id;
  UPDATE public.payments
     SET method = 'wallet_split', amount = (v_total_sen - v_wallet_sen)::NUMERIC / 100, updated_at = NOW()
   WHERE order_id = v_session.order_id;
  UPDATE public.orders SET payment_method = 'wallet_split', updated_at = NOW() WHERE id = v_session.order_id;
  RETURN jsonb_build_object('checkout_session_id', p_checkout_session_id, 'wallet_amount_sen', v_wallet_sen, 'external_amount_sen', v_total_sen - v_wallet_sen, 'status', 'reserved');
END;
$$;

CREATE OR REPLACE FUNCTION public.release_wallet_split_checkout(p_checkout_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.checkout_wallet_reservations%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_amount BIGINT;
BEGIN
  SELECT * INTO v_reservation FROM public.checkout_wallet_reservations WHERE checkout_session_id = p_checkout_session_id FOR UPDATE;
  IF NOT FOUND OR v_reservation.status <> 'reserved' THEN RETURN; END IF;
  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_reservation.wallet_id FOR UPDATE;
  v_amount := v_reservation.topup_amount_sen;
  IF v_amount > 0 THEN
    UPDATE public.wallets SET topup_sen = topup_sen + v_amount, updated_at = NOW() WHERE id = v_wallet.id;
    INSERT INTO public.wallet_transactions (user_id, wallet_id, order_id, idempotency_key, type, amount_sen, bucket, direction, note)
    VALUES (v_reservation.user_id, v_wallet.id, (SELECT order_id FROM public.checkout_sessions WHERE id = p_checkout_session_id), 'wallet-split-release:' || p_checkout_session_id::TEXT || ':topup', 'refund', v_amount, 'topup', 'credit', 'Wallet split-payment reservation released') ON CONFLICT DO NOTHING;
  END IF;
  v_amount := v_reservation.earnings_amount_sen;
  IF v_amount > 0 THEN
    UPDATE public.wallets SET earnings_sen = earnings_sen + v_amount, updated_at = NOW() WHERE id = v_wallet.id;
    INSERT INTO public.wallet_transactions (user_id, wallet_id, order_id, idempotency_key, type, amount_sen, bucket, direction, note)
    VALUES (v_reservation.user_id, v_wallet.id, (SELECT order_id FROM public.checkout_sessions WHERE id = p_checkout_session_id), 'wallet-split-release:' || p_checkout_session_id::TEXT || ':earnings', 'refund', v_amount, 'earnings', 'credit', 'Wallet split-payment reservation released') ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.checkout_wallet_reservations SET status = 'released', updated_at = NOW() WHERE checkout_session_id = p_checkout_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_wallet_split_checkout_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('failed','expired','cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.release_wallet_split_checkout(NEW.id);
  ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.checkout_wallet_reservations SET status = 'committed', updated_at = NOW() WHERE checkout_session_id = NEW.id AND status = 'reserved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checkout_wallet_split_reservation_sync ON public.checkout_sessions;
CREATE TRIGGER checkout_wallet_split_reservation_sync
  AFTER UPDATE OF status ON public.checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.sync_wallet_split_checkout_reservation();

REVOKE ALL ON FUNCTION public.reserve_wallet_split_checkout(UUID), public.release_wallet_split_checkout(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_wallet_split_checkout(UUID), public.release_wallet_split_checkout(UUID) TO authenticated, service_role;
