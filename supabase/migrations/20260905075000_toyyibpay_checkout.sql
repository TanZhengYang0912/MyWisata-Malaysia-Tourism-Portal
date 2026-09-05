-- Durable ToyyibPay bill creation and service-confirmed settlement.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_create_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS provider_create_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_create_completed_at TIMESTAMPTZ;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_provider_create_status_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_provider_create_status_check
  CHECK (provider_create_status IN ('not_started', 'creating', 'created'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_provider_event_unique
  ON public.payment_events(provider, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_payments_toyyibpay_reconciliation
  ON public.payments(updated_at, order_id)
  WHERE provider = 'toyyibpay'
    AND provider_payment_id IS NOT NULL
    AND status IN ('pending', 'requires_action');

CREATE OR REPLACE FUNCTION public.begin_toyyibpay_checkout(
  p_checkout_session_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.checkout_sessions%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_amount_sen BIGINT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  SELECT * INTO v_session
    FROM public.checkout_sessions
   WHERE id = p_checkout_session_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_session_not_found'; END IF;
  IF v_session.payment_method <> 'bank_transfer' THEN RAISE EXCEPTION 'payment_provider_mismatch'; END IF;

  SELECT * INTO v_payment
    FROM public.payments
   WHERE order_id = v_session.order_id
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_payment_not_found'; END IF;

  v_amount_sen := ROUND(v_payment.amount * 100)::BIGINT;
  IF v_amount_sen <= 0 OR UPPER(v_session.currency) <> 'MYR' THEN
    RAISE EXCEPTION 'provider_amount_invalid';
  END IF;

  IF v_payment.provider = 'toyyibpay'
     AND v_payment.provider_create_status = 'created'
     AND v_payment.provider_payment_id ~ '^[A-Za-z0-9]{8}$' THEN
    RETURN jsonb_build_object(
      'state', 'created',
      'checkout_session_id', v_session.id,
      'order_id', v_session.order_id,
      'user_id', v_session.user_id,
      'amount_sen', v_amount_sen,
      'currency', UPPER(v_session.currency),
      'provider_payment_id', v_payment.provider_payment_id
    );
  END IF;

  IF v_payment.provider = 'toyyibpay' AND v_payment.provider_create_status = 'creating' THEN
    RETURN jsonb_build_object('state', 'indeterminate');
  END IF;
  IF v_session.status IN ('paid', 'failed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'checkout_terminal_conflict';
  END IF;
  IF v_payment.provider NOT IN ('platform', 'toyyibpay') THEN
    RAISE EXCEPTION 'payment_provider_mismatch';
  END IF;

  UPDATE public.payments
     SET provider = 'toyyibpay',
         provider_payment_id = NULL,
         provider_create_status = 'creating',
         provider_create_attempted_at = NOW(),
         provider_create_completed_at = NULL,
         updated_at = NOW()
   WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'state', 'ready',
    'checkout_session_id', v_session.id,
    'order_id', v_session.order_id,
    'user_id', v_session.user_id,
    'amount_sen', v_amount_sen,
    'currency', UPPER(v_session.currency),
    'provider_payment_id', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_toyyibpay_checkout(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_toyyibpay_checkout(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_toyyibpay_checkout(
  p_checkout_session_id UUID,
  p_provider_payment_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.checkout_sessions%ROWTYPE;
  v_payment public.payments%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF COALESCE(p_provider_payment_id, '') !~ '^[A-Za-z0-9]{8}$' THEN
    RAISE EXCEPTION 'provider_payment_id_invalid';
  END IF;

  SELECT * INTO v_session
    FROM public.checkout_sessions
   WHERE id = p_checkout_session_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_session_not_found'; END IF;
  IF v_session.payment_method <> 'bank_transfer' THEN RAISE EXCEPTION 'payment_provider_mismatch'; END IF;

  SELECT * INTO v_payment
    FROM public.payments
   WHERE order_id = v_session.order_id
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_payment_not_found'; END IF;
  IF v_payment.provider <> 'toyyibpay' THEN RAISE EXCEPTION 'payment_provider_mismatch'; END IF;

  IF v_payment.provider_create_status = 'created' THEN
    IF v_payment.provider_payment_id IS DISTINCT FROM p_provider_payment_id THEN
      RAISE EXCEPTION 'provider_payment_id_mismatch';
    END IF;
    RETURN jsonb_build_object('state', 'created', 'provider_payment_id', v_payment.provider_payment_id);
  END IF;
  IF v_session.status IN ('paid', 'failed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'checkout_terminal_conflict';
  END IF;
  IF v_payment.provider_create_status <> 'creating' THEN
    RAISE EXCEPTION 'provider_create_state_invalid';
  END IF;

  UPDATE public.payments
     SET provider_payment_id = p_provider_payment_id,
         provider_create_status = 'created',
         provider_create_completed_at = NOW(),
         status = 'requires_action',
         updated_at = NOW()
   WHERE id = v_payment.id;
  UPDATE public.checkout_sessions
     SET status = 'requires_action', updated_at = NOW()
   WHERE id = v_session.id AND status IN ('pending_payment', 'requires_action');

  RETURN jsonb_build_object('state', 'created', 'provider_payment_id', p_provider_payment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_toyyibpay_checkout(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_toyyibpay_checkout(UUID, TEXT) TO service_role;

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
  v_inserted INTEGER;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_provider NOT IN ('stripe', 'toyyibpay', 'tng_ewallet_simulator', 'grabpay_simulator', 'bank_transfer_simulator') THEN
    RAISE EXCEPTION 'payment_provider_invalid';
  END IF;
  IF LOWER(COALESCE(p_outcome, '')) NOT IN ('succeeded', 'failed', 'cancelled', 'expired', 'pending') THEN
    RAISE EXCEPTION 'invalid_checkout_outcome';
  END IF;
  IF LOWER(p_outcome) = 'pending' AND p_provider <> 'toyyibpay' THEN
    RAISE EXCEPTION 'invalid_checkout_outcome';
  END IF;
  IF BTRIM(COALESCE(p_provider_payment_id, '')) = '' OR LENGTH(p_provider_payment_id) > 255 THEN
    RAISE EXCEPTION 'provider_payment_id_invalid';
  END IF;
  IF p_provider = 'toyyibpay' AND p_provider_payment_id !~ '^[A-Za-z0-9]{8}$' THEN
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
    OR (p_provider = 'toyyibpay' AND v_session.payment_method = 'bank_transfer')
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
  IF p_provider = 'toyyibpay' AND v_payment.provider_create_status <> 'created' THEN
    RAISE EXCEPTION 'provider_payment_id_invalid';
  END IF;
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
    WHEN 'pending' THEN 'requires_action'
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

  IF LOWER(p_outcome) = 'pending' THEN
    INSERT INTO public.payment_events(
      provider, provider_event_id, checkout_session_id, order_id, event_type, payload_hash
    ) VALUES (
      p_provider, BTRIM(p_provider_event_id), v_session.id, v_session.order_id, v_event_type, p_payload_sha256
    ) ON CONFLICT (provider, provider_event_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 0 THEN
      SELECT * INTO v_event
        FROM public.payment_events
       WHERE provider = p_provider AND provider_event_id = p_provider_event_id;
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
    IF v_session.status NOT IN ('paid', 'failed', 'cancelled', 'expired') THEN
      UPDATE public.checkout_sessions
         SET status = 'requires_action', updated_at = NOW()
       WHERE id = v_session.id;
      UPDATE public.payments
         SET status = 'requires_action', updated_at = NOW()
       WHERE id = v_payment.id;
      v_session.status := 'requires_action';
    END IF;
    RETURN jsonb_build_object(
      'checkout_session_id', v_session.id,
      'order_id', v_session.order_id,
      'user_id', v_session.user_id,
      'status', v_session.status,
      'idempotent', FALSE
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
  ) ON CONFLICT (provider, provider_event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    SELECT * INTO v_event
      FROM public.payment_events
     WHERE provider = p_provider AND provider_event_id = p_provider_event_id;
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
