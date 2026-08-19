-- Provider-ready non-production checkout simulator boundaries.
-- External payment outcomes are service-confirmed; customers may settle only Wallet orders.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN (
    'mock_card', 'stripe_card', 'ewallet', 'bank_transfer', 'wallet', 'wallet_split'
  ));

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN (
    'mock_card', 'stripe_card', 'ewallet', 'bank_transfer', 'wallet', 'wallet_split', 'mock_fail'
  ));

REVOKE ALL ON FUNCTION public.release_wallet_split_checkout(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_wallet_split_checkout(UUID) TO service_role;

-- The generic finalizer remains the atomic settlement implementation, but it is
-- no longer a customer-callable payment-confirmation API.
REVOKE ALL ON FUNCTION public.finalize_checkout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_checkout(UUID, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_customer_wallet_checkout(
  p_checkout_session_id UUID,
  p_outcome TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session public.checkout_sessions%ROWTYPE;
  v_result JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'checkout_auth_required'; END IF;
  IF LOWER(COALESCE(p_outcome, '')) NOT IN ('succeeded', 'failed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'invalid_checkout_outcome';
  END IF;

  SELECT * INTO v_session
    FROM public.checkout_sessions
   WHERE id = p_checkout_session_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_session_not_found'; END IF;
  IF v_session.user_id <> v_user THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;
  IF v_session.payment_method <> 'wallet' THEN
    RAISE EXCEPTION 'provider_confirmation_required';
  END IF;

  v_result := public.finalize_checkout(p_checkout_session_id, LOWER(p_outcome), NULL, NULL);
  IF LOWER(p_outcome) = 'cancelled' THEN
    UPDATE public.checkout_sessions SET status = 'cancelled', updated_at = NOW()
     WHERE id = p_checkout_session_id AND status = 'failed';
    UPDATE public.payments SET status = 'cancelled', failure_reason = 'cancelled', updated_at = NOW()
     WHERE order_id = v_session.order_id AND status = 'failed';
    v_result := v_result || jsonb_build_object('status', 'cancelled');
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_customer_wallet_checkout(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_customer_wallet_checkout(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.settle_provider_checkout(
  p_checkout_session_id UUID,
  p_provider TEXT,
  p_outcome TEXT,
  p_provider_payment_id TEXT,
  p_provider_event_id TEXT,
  p_payload_sha256 TEXT,
  p_amount_sen BIGINT,
  p_currency TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.checkout_sessions%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_event public.payment_events%ROWTYPE;
  v_event_type TEXT;
  v_target_status TEXT;
  v_result JSONB;
  v_expected_amount_sen BIGINT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_provider NOT IN ('stripe', 'tng_ewallet_simulator', 'grabpay_simulator', 'bank_transfer_simulator') THEN
    RAISE EXCEPTION 'payment_provider_invalid';
  END IF;
  IF LOWER(COALESCE(p_outcome, '')) NOT IN ('succeeded', 'failed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'invalid_checkout_outcome';
  END IF;
  IF BTRIM(COALESCE(p_provider_payment_id, '')) = '' OR LENGTH(p_provider_payment_id) > 255 THEN
    RAISE EXCEPTION 'provider_payment_id_invalid';
  END IF;
  IF BTRIM(COALESCE(p_provider_event_id, '')) = '' OR LENGTH(p_provider_event_id) > 255 THEN
    RAISE EXCEPTION 'provider_event_id_invalid';
  END IF;
  IF COALESCE(p_payload_sha256, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'provider_payload_hash_invalid';
  END IF;
  IF p_amount_sen IS NULL OR p_amount_sen <= 0 THEN RAISE EXCEPTION 'provider_amount_invalid'; END IF;
  IF UPPER(COALESCE(p_currency, '')) <> 'MYR' THEN RAISE EXCEPTION 'provider_currency_invalid'; END IF;

  SELECT * INTO v_session
    FROM public.checkout_sessions
   WHERE id = p_checkout_session_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_session_not_found'; END IF;

  IF NOT (
    (p_provider = 'stripe' AND v_session.payment_method IN ('stripe_card', 'wallet_split'))
    OR (p_provider IN ('tng_ewallet_simulator', 'grabpay_simulator') AND v_session.payment_method = 'ewallet')
    OR (p_provider = 'bank_transfer_simulator' AND v_session.payment_method = 'bank_transfer')
  ) THEN
    RAISE EXCEPTION 'payment_provider_mismatch';
  END IF;

  SELECT * INTO v_payment
    FROM public.payments
   WHERE order_id = v_session.order_id
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_payment_not_found'; END IF;
  IF v_payment.provider <> p_provider THEN RAISE EXCEPTION 'payment_provider_mismatch'; END IF;
  IF v_payment.provider_payment_id IS DISTINCT FROM BTRIM(p_provider_payment_id) THEN
    RAISE EXCEPTION 'provider_payment_id_mismatch';
  END IF;
  v_expected_amount_sen := ROUND(v_payment.amount * 100)::BIGINT;
  IF v_expected_amount_sen <> p_amount_sen THEN RAISE EXCEPTION 'provider_amount_mismatch'; END IF;
  IF UPPER(v_session.currency) <> UPPER(p_currency) THEN RAISE EXCEPTION 'provider_currency_mismatch'; END IF;

  v_event_type := 'payment.' || LOWER(p_outcome);
  v_target_status := CASE LOWER(p_outcome)
    WHEN 'succeeded' THEN 'paid'
    WHEN 'failed' THEN 'failed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'expired'
  END;

  SELECT * INTO v_event
    FROM public.payment_events
   WHERE provider = p_provider AND provider_event_id = p_provider_event_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_event.payload_hash IS DISTINCT FROM p_payload_sha256
       OR v_event.checkout_session_id IS DISTINCT FROM v_session.id
       OR v_event.order_id IS DISTINCT FROM v_session.order_id
       OR v_event.event_type IS DISTINCT FROM v_event_type THEN
      RAISE EXCEPTION 'provider_event_conflict';
    END IF;
    RETURN jsonb_build_object(
      'checkout_session_id', v_session.id,
      'order_id', v_session.order_id,
      'user_id', v_session.user_id,
      'status', v_session.status,
      'idempotent', TRUE
    );
  END IF;

  IF v_session.status IN ('paid', 'failed', 'cancelled', 'expired')
     AND v_session.status <> v_target_status THEN
    RAISE EXCEPTION 'checkout_terminal_conflict';
  END IF;

  INSERT INTO public.payment_events(
    provider, provider_event_id, checkout_session_id, order_id, event_type, payload_hash
  ) VALUES (
    p_provider, BTRIM(p_provider_event_id), v_session.id, v_session.order_id, v_event_type, p_payload_sha256
  );

  IF v_session.status = v_target_status THEN
    RETURN jsonb_build_object(
      'checkout_session_id', v_session.id,
      'order_id', v_session.order_id,
      'user_id', v_session.user_id,
      'status', v_session.status,
      'idempotent', TRUE
    );
  END IF;

  v_result := public.finalize_checkout(
    v_session.id,
    LOWER(p_outcome),
    BTRIM(p_provider_payment_id),
    NULL
  );

  IF LOWER(p_outcome) = 'cancelled' THEN
    UPDATE public.checkout_sessions SET status = 'cancelled', updated_at = NOW()
     WHERE id = v_session.id AND status = 'failed';
    UPDATE public.payments SET status = 'cancelled', failure_reason = 'cancelled', updated_at = NOW()
     WHERE id = v_payment.id AND status = 'failed';
  END IF;

  RETURN jsonb_build_object(
    'checkout_session_id', v_session.id,
    'order_id', v_session.order_id,
    'user_id', v_session.user_id,
    'status', v_target_status,
    'idempotent', FALSE,
    'result', v_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_provider_checkout(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_provider_checkout(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS provider_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_refund_event_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_failure_code TEXT,
  ADD COLUMN IF NOT EXISTS provider_failure_message TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS refunds_provider_refund_id_unique
  ON public.refunds(provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.begin_simulated_refund(
  p_refund_id UUID,
  p_provider TEXT,
  p_provider_refund_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
  v_payment public.payments%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_provider NOT IN ('tng_ewallet_simulator', 'grabpay_simulator', 'bank_transfer_simulator') THEN
    RAISE EXCEPTION 'refund_provider_invalid';
  END IF;
  IF COALESCE(p_provider_refund_id, '') !~ '^sim_refund_[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'provider_refund_id_invalid';
  END IF;

  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found'; END IF;
  IF v_refund.status <> 'pending' THEN RAISE EXCEPTION 'refund_not_pending'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = v_refund.payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_payment_not_found'; END IF;
  IF v_payment.provider <> p_provider THEN RAISE EXCEPTION 'refund_provider_mismatch'; END IF;
  IF v_payment.status <> 'succeeded' THEN RAISE EXCEPTION 'refund_payment_not_succeeded'; END IF;
  IF EXISTS (
    SELECT 1
      FROM public.refunds other_refund
     WHERE other_refund.payment_id = v_refund.payment_id
       AND other_refund.id <> v_refund.id
       AND other_refund.status IN ('approved', 'processed')
  ) THEN
    RAISE EXCEPTION 'refund_already_active';
  END IF;

  UPDATE public.refunds
     SET status = 'approved',
         provider_refund_id = p_provider_refund_id,
         provider_refund_event_id = NULL,
         provider_failure_code = NULL,
         provider_failure_message = NULL,
         attempt_count = attempt_count + 1,
         updated_at = NOW()
   WHERE id = p_refund_id;

  RETURN jsonb_build_object(
    'refund_id', p_refund_id,
    'order_id', v_refund.order_id,
    'status', 'approved',
    'provider', p_provider,
    'provider_refund_id', p_provider_refund_id,
    'attempt_count', v_refund.attempt_count + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_simulated_refund(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_simulated_refund(UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_simulated_refund(
  p_refund_id UUID,
  p_provider TEXT,
  p_event_id TEXT,
  p_provider_refund_id TEXT,
  p_outcome TEXT,
  p_payload_sha256 TEXT,
  p_amount_sen BIGINT,
  p_currency TEXT,
  p_failure_code TEXT,
  p_failure_message TEXT,
  p_retryable BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_event public.payment_events%ROWTYPE;
  v_event_type TEXT;
  v_status TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_provider NOT IN ('tng_ewallet_simulator', 'grabpay_simulator', 'bank_transfer_simulator') THEN
    RAISE EXCEPTION 'refund_provider_invalid';
  END IF;
  IF p_outcome NOT IN ('succeeded', 'failed') THEN RAISE EXCEPTION 'refund_outcome_invalid'; END IF;
  IF BTRIM(COALESCE(p_event_id, '')) = '' OR LENGTH(p_event_id) > 255 THEN RAISE EXCEPTION 'refund_event_id_invalid'; END IF;
  IF COALESCE(p_payload_sha256, '') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'refund_payload_hash_invalid'; END IF;
  IF p_amount_sen IS NULL OR p_amount_sen <= 0 THEN RAISE EXCEPTION 'refund_amount_invalid'; END IF;
  IF UPPER(COALESCE(p_currency, '')) <> 'MYR' THEN RAISE EXCEPTION 'refund_currency_invalid'; END IF;

  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = v_refund.payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_payment_not_found'; END IF;
  IF v_payment.provider <> p_provider THEN RAISE EXCEPTION 'refund_provider_mismatch'; END IF;
  IF v_refund.provider_refund_id IS DISTINCT FROM p_provider_refund_id THEN RAISE EXCEPTION 'provider_refund_id_mismatch'; END IF;
  IF ROUND(v_refund.amount * 100)::BIGINT <> p_amount_sen THEN RAISE EXCEPTION 'refund_amount_mismatch'; END IF;

  v_event_type := 'refund.' || p_outcome;
  SELECT * INTO v_event
    FROM public.payment_events
   WHERE provider = p_provider AND provider_event_id = p_event_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_event.payload_hash IS DISTINCT FROM p_payload_sha256
       OR v_event.order_id IS DISTINCT FROM v_refund.order_id
       OR v_event.event_type IS DISTINCT FROM v_event_type
       OR v_refund.provider_refund_event_id IS DISTINCT FROM p_event_id THEN
      RAISE EXCEPTION 'refund_provider_event_conflict';
    END IF;
    RETURN jsonb_build_object(
      'refund_id', v_refund.id,
      'order_id', v_refund.order_id,
      'status', v_refund.status,
      'idempotent', TRUE
    );
  END IF;
  IF v_payment.status <> 'succeeded' THEN RAISE EXCEPTION 'refund_payment_not_succeeded'; END IF;
  IF v_refund.status <> 'approved' THEN RAISE EXCEPTION 'refund_not_awaiting_provider'; END IF;

  INSERT INTO public.payment_events(
    provider, provider_event_id, checkout_session_id, order_id, event_type, payload_hash
  ) VALUES (
    p_provider, p_event_id, NULL, v_refund.order_id, v_event_type, p_payload_sha256
  );

  IF p_outcome = 'succeeded' THEN
    UPDATE public.refunds
       SET status = 'processed',
           provider_refund_event_id = p_event_id,
           provider_failure_code = NULL,
           provider_failure_message = NULL,
           processed_at = NOW(),
           updated_at = NOW()
     WHERE id = v_refund.id;
    UPDATE public.payments SET status = 'refunded', updated_at = NOW() WHERE id = v_payment.id;
    UPDATE public.orders SET status = 'refunded', updated_at = NOW() WHERE id = v_refund.order_id;
    v_status := 'processed';
  ELSE
    v_status := CASE WHEN COALESCE(p_retryable, FALSE) THEN 'pending' ELSE 'rejected' END;
    UPDATE public.refunds
       SET status = v_status,
           provider_refund_event_id = p_event_id,
           provider_failure_code = LEFT(NULLIF(BTRIM(p_failure_code), ''), 120),
           provider_failure_message = LEFT(NULLIF(BTRIM(p_failure_message), ''), 500),
           updated_at = NOW()
     WHERE id = v_refund.id;
  END IF;

  RETURN jsonb_build_object(
    'refund_id', v_refund.id,
    'order_id', v_refund.order_id,
    'status', v_status,
    'idempotent', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_simulated_refund(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_simulated_refund(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
