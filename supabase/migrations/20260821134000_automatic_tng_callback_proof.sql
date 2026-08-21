-- Durable non-production TNG callback delivery and safe settlement proof.
-- This migration does not implement or enable a live TNG provider.

DO $$
BEGIN
  IF to_regprocedure('public.record_tng_payout(uuid,text)') IS NULL
     OR to_regprocedure('public.mark_provider_withdrawal_processing(uuid,text,text)') IS NULL
     OR to_regprocedure('public.complete_withdrawal_payout(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'provider_neutral_withdrawal_migrations_required';
  END IF;
END;
$$;

-- ── Safe provider-event proof fields ───────────────────────────────────────

ALTER TABLE public.payout_provider_events
  ADD COLUMN IF NOT EXISTS amount_sen BIGINT,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS provider_occurred_at TIMESTAMPTZ;

-- Migration-only backfill: temporarily remove the append-only trigger inside
-- this transaction, then restore it before any schema change becomes visible.
DROP TRIGGER IF EXISTS payout_provider_events_append_only
  ON public.payout_provider_events;

UPDATE public.payout_provider_events AS event
   SET amount_sen = ROUND(request.amount * 100)::BIGINT,
       currency = 'MYR',
       provider_occurred_at = event.received_at
  FROM public.withdrawal_requests AS request
 WHERE request.id = event.withdrawal_id
   AND (
     event.amount_sen IS NULL
     OR event.currency IS NULL
     OR event.provider_occurred_at IS NULL
   );

CREATE TRIGGER payout_provider_events_append_only
  BEFORE UPDATE OR DELETE ON public.payout_provider_events
  FOR EACH ROW EXECUTE FUNCTION public.payout_provider_events_are_append_only();

ALTER TABLE public.payout_provider_events
  ALTER COLUMN amount_sen SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN provider_occurred_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.payout_provider_events'::regclass
       AND conname = 'payout_provider_events_amount_positive'
  ) THEN
    ALTER TABLE public.payout_provider_events
      ADD CONSTRAINT payout_provider_events_amount_positive CHECK (amount_sen > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.payout_provider_events'::regclass
       AND conname = 'payout_provider_events_currency_myr'
  ) THEN
    ALTER TABLE public.payout_provider_events
      ADD CONSTRAINT payout_provider_events_currency_myr CHECK (currency = 'MYR');
  END IF;
END;
$$;

-- ── Durable mock callback outbox ───────────────────────────────────────────

CREATE TABLE public.tng_mock_callback_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES public.withdrawal_requests(id) ON DELETE RESTRICT,
  provider_payout_id TEXT NOT NULL CHECK (char_length(provider_payout_id) BETWEEN 1 AND 255),
  amount_sen BIGINT NOT NULL CHECK (amount_sen > 0),
  event_key TEXT NOT NULL UNIQUE CHECK (char_length(event_key) BETWEEN 1 AND 255),
  event_id TEXT NOT NULL UNIQUE DEFAULT ('tng_evt_' || replace(gen_random_uuid()::TEXT, '-', '')),
  outcome TEXT NOT NULL DEFAULT 'paid' CHECK (outcome IN ('paid', 'failed')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'exhausted')),
  available_at TIMESTAMPTZ NOT NULL,
  provider_occurred_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  next_attempt_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error_code TEXT CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (withdrawal_id, provider_payout_id, outcome)
);

CREATE INDEX tng_mock_callback_outbox_due_idx
  ON public.tng_mock_callback_outbox(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.tng_mock_callback_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tng_mock_callback_outbox
  FROM PUBLIC, anon, authenticated, service_role;

-- ── approved -> processing + one durable callback ──────────────────────────

CREATE OR REPLACE FUNCTION public.start_tng_mock_payout(
  p_withdrawal_id UUID,
  p_provider_payout_id TEXT,
  p_available_at TIMESTAMPTZ,
  p_outcome TEXT DEFAULT 'paid'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
  v_outbox public.tng_mock_callback_outbox%ROWTYPE;
  v_created BOOLEAN := false;
  v_provider_payout_id TEXT := BTRIM(COALESCE(p_provider_payout_id, ''));
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF v_provider_payout_id = '' OR char_length(v_provider_payout_id) > 255 THEN
    RAISE EXCEPTION 'provider_payout_id_invalid';
  END IF;
  IF p_available_at IS NULL THEN RAISE EXCEPTION 'callback_available_at_required'; END IF;
  IF p_outcome NOT IN ('paid', 'failed') THEN RAISE EXCEPTION 'mock_outcome_invalid'; END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.payout_provider IS DISTINCT FROM 'tng_direct_credit' THEN
    RAISE EXCEPTION 'payout_provider_mismatch';
  END IF;

  IF v_request.status = 'processing' THEN
    IF v_request.payout_provider_event_id IS DISTINCT FROM v_provider_payout_id THEN
      RAISE EXCEPTION 'provider_payout_id_conflict';
    END IF;
  ELSIF v_request.status = 'approved' THEN
    PERFORM public.record_tng_payout(p_withdrawal_id, v_provider_payout_id);
    PERFORM public.mark_provider_withdrawal_processing(
      p_withdrawal_id,
      'tng_direct_credit',
      v_provider_payout_id
    );
  ELSE
    RAISE EXCEPTION 'withdrawal_not_approved';
  END IF;

  INSERT INTO public.tng_mock_callback_outbox(
    withdrawal_id,
    provider_payout_id,
    amount_sen,
    event_key,
    outcome,
    available_at,
    provider_occurred_at,
    next_attempt_at
  ) VALUES (
    p_withdrawal_id,
    v_provider_payout_id,
    ROUND(v_request.amount * 100)::BIGINT,
    'tng_mock:' || p_withdrawal_id::TEXT || ':' || p_outcome,
    p_outcome,
    p_available_at,
    p_available_at,
    p_available_at
  )
  ON CONFLICT (withdrawal_id, provider_payout_id, outcome) DO NOTHING
  RETURNING * INTO v_outbox;

  IF FOUND THEN
    v_created := true;
    INSERT INTO public.audit_logs(
      actor_id, action, entity_type, entity_id, before_data, after_data, note
    ) VALUES (
      NULL,
      'withdrawal.callback_queued',
      'withdrawal',
      p_withdrawal_id,
      jsonb_build_object('status', 'processing'),
      jsonb_build_object(
        'status', 'processing',
        'provider', 'tng_direct_credit',
        'callback_status', 'pending'
      ),
      'TNG mock provider callback queued'
    );
  ELSE
    SELECT * INTO v_outbox
      FROM public.tng_mock_callback_outbox
     WHERE withdrawal_id = p_withdrawal_id
       AND provider_payout_id = v_provider_payout_id
       AND outcome = p_outcome;
  END IF;

  RETURN jsonb_build_object(
    'request_id', p_withdrawal_id,
    'status', 'processing',
    'outbox_id', v_outbox.id,
    'event_id', v_outbox.event_id,
    'available_at', v_outbox.available_at,
    'idempotent', NOT v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_tng_mock_payout(UUID, TEXT, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_tng_mock_payout(UUID, TEXT, TIMESTAMPTZ, TEXT)
  TO service_role;

-- ── Concurrency-safe claim and bounded completion ──────────────────────────

CREATE OR REPLACE FUNCTION public.claim_tng_mock_callback_outbox(
  p_limit INTEGER DEFAULT 20,
  p_outbox_id UUID DEFAULT NULL
) RETURNS SETOF public.tng_mock_callback_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT outbox.id
      FROM public.tng_mock_callback_outbox AS outbox
     WHERE outbox.attempt_count < 5
       AND outbox.next_attempt_at <= now()
       AND (p_outbox_id IS NULL OR outbox.id = p_outbox_id)
       AND (
         outbox.status = 'pending'
         OR (
           outbox.status = 'processing'
           AND outbox.claimed_at <= now() - interval '5 minutes'
         )
       )
     ORDER BY outbox.next_attempt_at, outbox.created_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tng_mock_callback_outbox AS outbox
     SET status = 'processing',
         attempt_count = outbox.attempt_count + 1,
         claimed_at = now(),
         updated_at = now()
    FROM candidates
   WHERE outbox.id = candidates.id
  RETURNING outbox.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_tng_mock_callback_outbox(INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tng_mock_callback_outbox(INTEGER, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finish_tng_mock_callback_attempt(
  p_outbox_id UUID,
  p_delivered BOOLEAN,
  p_error_code TEXT DEFAULT NULL,
  p_retryable BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox public.tng_mock_callback_outbox%ROWTYPE;
  v_status TEXT;
  v_error_code TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;

  SELECT * INTO v_outbox
    FROM public.tng_mock_callback_outbox
   WHERE id = p_outbox_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'callback_outbox_not_found'; END IF;
  IF v_outbox.status = 'delivered' THEN
    RETURN jsonb_build_object('outbox_id', p_outbox_id, 'status', 'delivered', 'idempotent', true);
  END IF;
  IF v_outbox.status <> 'processing' THEN RAISE EXCEPTION 'callback_outbox_not_claimed'; END IF;

  v_error_code := NULLIF(LEFT(regexp_replace(
    COALESCE(p_error_code, ''), '[^A-Za-z0-9_.:-]', '_', 'g'
  ), 120), '');

  IF p_delivered THEN
    v_status := 'delivered';
    UPDATE public.tng_mock_callback_outbox
       SET status = 'delivered',
           delivered_at = now(),
           last_error_code = NULL,
           claimed_at = NULL,
           updated_at = now()
     WHERE id = p_outbox_id;
  ELSIF COALESCE(p_retryable, false) AND v_outbox.attempt_count < 5 THEN
    v_status := 'pending';
    UPDATE public.tng_mock_callback_outbox
       SET status = 'pending',
           next_attempt_at = now() + CASE v_outbox.attempt_count
             WHEN 1 THEN interval '5 seconds'
             WHEN 2 THEN interval '30 seconds'
             WHEN 3 THEN interval '2 minutes'
             ELSE interval '10 minutes'
           END,
           last_error_code = COALESCE(v_error_code, 'callback_delivery_failed'),
           claimed_at = NULL,
           updated_at = now()
     WHERE id = p_outbox_id;
  ELSE
    v_status := 'exhausted';
    UPDATE public.tng_mock_callback_outbox
       SET status = 'exhausted',
           last_error_code = COALESCE(v_error_code, 'callback_delivery_failed'),
           claimed_at = NULL,
           updated_at = now()
     WHERE id = p_outbox_id;
  END IF;

  RETURN jsonb_build_object(
    'outbox_id', p_outbox_id,
    'status', v_status,
    'attempt_count', v_outbox.attempt_count,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_tng_mock_callback_attempt(UUID, BOOLEAN, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_tng_mock_callback_attempt(UUID, BOOLEAN, TEXT, BOOLEAN)
  TO service_role;

-- ── Reconciliation for missed jobs and abandoned claims ────────────────────

CREATE OR REPLACE FUNCTION public.reconcile_tng_mock_callbacks(
  p_stale_before TIMESTAMPTZ DEFAULT (now() - interval '5 minutes'),
  p_limit INTEGER DEFAULT 50
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released INTEGER := 0;
  v_exhausted INTEGER := 0;
  v_inserted INTEGER := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;

  WITH stale_exhausted AS (
    SELECT outbox.id
      FROM public.tng_mock_callback_outbox AS outbox
     WHERE outbox.status = 'processing'
       AND outbox.claimed_at < p_stale_before
       AND outbox.attempt_count >= 5
     ORDER BY outbox.claimed_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tng_mock_callback_outbox AS outbox
     SET status = 'exhausted',
         claimed_at = NULL,
         last_error_code = 'stale_claim_exhausted',
         updated_at = now()
    FROM stale_exhausted
   WHERE outbox.id = stale_exhausted.id;
  GET DIAGNOSTICS v_exhausted = ROW_COUNT;

  WITH stale AS (
    SELECT outbox.id
      FROM public.tng_mock_callback_outbox AS outbox
     WHERE outbox.status = 'processing'
       AND outbox.status <> 'exhausted'
       AND outbox.claimed_at < p_stale_before
       AND outbox.attempt_count < 5
     ORDER BY outbox.claimed_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tng_mock_callback_outbox AS outbox
     SET status = 'pending',
         next_attempt_at = now(),
         claimed_at = NULL,
         last_error_code = 'stale_claim_released',
         updated_at = now()
    FROM stale
   WHERE outbox.id = stale.id;
  GET DIAGNOSTICS v_released = ROW_COUNT;

  WITH missing AS (
    SELECT request.id,
           request.payout_provider_event_id,
           ROUND(request.amount * 100)::BIGINT AS amount_sen
      FROM public.withdrawal_requests AS request
     WHERE request.status = 'processing'
       AND request.payout_provider = 'tng_direct_credit'
       AND request.payout_provider_event_id IS NOT NULL
       AND request.updated_at < p_stale_before
       AND NOT EXISTS (
         SELECT 1 FROM public.payout_provider_events AS event
          WHERE event.withdrawal_id = request.id
            AND event.provider = 'tng_direct_credit'
            AND event.status IN ('paid', 'failed')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.tng_mock_callback_outbox AS outbox
          WHERE outbox.withdrawal_id = request.id
            AND outbox.provider_payout_id = request.payout_provider_event_id
       )
     ORDER BY request.updated_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
     FOR UPDATE OF request SKIP LOCKED
  )
  INSERT INTO public.tng_mock_callback_outbox(
    withdrawal_id, provider_payout_id, amount_sen, event_key, outcome,
    available_at, provider_occurred_at, next_attempt_at
  )
  SELECT missing.id,
         missing.payout_provider_event_id,
         missing.amount_sen,
         'tng_mock:' || missing.id::TEXT || ':paid',
         'paid',
         now(),
         now(),
         now()
    FROM missing
  ON CONFLICT (withdrawal_id, provider_payout_id, outcome) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'released', v_released,
    'exhausted', v_exhausted,
    'inserted', v_inserted,
    'count', v_released + v_exhausted + v_inserted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_tng_mock_callbacks(TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_tng_mock_callbacks(TIMESTAMPTZ, INTEGER)
  TO service_role;

-- ── Amount/currency-aware signed settlement ────────────────────────────────

DROP FUNCTION IF EXISTS public.settle_provider_withdrawal(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT
);

CREATE OR REPLACE FUNCTION public.settle_provider_withdrawal(
  p_withdrawal_id UUID,
  p_provider TEXT,
  p_event_id TEXT,
  p_provider_payout_id TEXT,
  p_status TEXT,
  p_failure_code TEXT DEFAULT NULL,
  p_failure_message TEXT DEFAULT NULL,
  p_failure_category TEXT DEFAULT NULL,
  p_retryable BOOLEAN DEFAULT FALSE,
  p_payload_sha256 TEXT DEFAULT NULL,
  p_amount_sen BIGINT DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_provider_occurred_at TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
  v_existing_event public.payout_provider_events%ROWTYPE;
  v_inserted_event_id UUID;
  v_result JSONB;
  v_final_status TEXT;
  v_event_id TEXT := BTRIM(COALESCE(p_event_id, ''));
  v_provider_payout_id TEXT := BTRIM(COALESCE(p_provider_payout_id, ''));
  v_expected_amount_sen BIGINT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_provider <> 'tng_direct_credit' THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
  IF p_status NOT IN ('paid', 'failed') THEN RAISE EXCEPTION 'invalid_payout_status'; END IF;
  IF v_event_id = '' OR char_length(v_event_id) > 255 THEN RAISE EXCEPTION 'provider_event_id_invalid'; END IF;
  IF v_provider_payout_id = '' OR char_length(v_provider_payout_id) > 255 THEN RAISE EXCEPTION 'provider_payout_id_invalid'; END IF;
  IF p_payload_sha256 IS NOT NULL AND p_payload_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'payload_hash_invalid';
  END IF;
  IF p_provider_occurred_at IS NULL THEN RAISE EXCEPTION 'provider_occurred_at_required'; END IF;
  IF p_failure_category IS NOT NULL AND p_failure_category NOT IN (
    'invalid_destination', 'account_disabled', 'provider_rejected',
    'timeout', 'not_configured', 'unknown'
  ) THEN RAISE EXCEPTION 'failure_category_invalid'; END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.payout_provider IS DISTINCT FROM p_provider THEN RAISE EXCEPTION 'payout_provider_mismatch'; END IF;
  IF v_request.payout_provider_event_id IS DISTINCT FROM v_provider_payout_id THEN
    RAISE EXCEPTION 'provider_payout_id_conflict';
  END IF;

  v_expected_amount_sen := ROUND(v_request.amount * 100)::BIGINT;
  IF p_amount_sen IS DISTINCT FROM v_expected_amount_sen THEN RAISE EXCEPTION 'provider_amount_conflict'; END IF;
  IF p_currency IS DISTINCT FROM 'MYR' THEN RAISE EXCEPTION 'provider_currency_conflict'; END IF;

  INSERT INTO public.payout_provider_events(
    withdrawal_id, provider, event_id, provider_payout_id, status,
    failure_code, failure_category, failure_retryable, payload_sha256,
    amount_sen, currency, provider_occurred_at
  ) VALUES (
    p_withdrawal_id, p_provider, v_event_id, v_provider_payout_id, p_status,
    LEFT(NULLIF(BTRIM(COALESCE(p_failure_code, '')), ''), 120),
    p_failure_category, COALESCE(p_retryable, false), p_payload_sha256,
    p_amount_sen, p_currency, p_provider_occurred_at
  )
  ON CONFLICT (provider, event_id) DO NOTHING
  RETURNING id INTO v_inserted_event_id;

  IF v_inserted_event_id IS NULL THEN
    SELECT * INTO v_existing_event
      FROM public.payout_provider_events
     WHERE provider = p_provider AND event_id = v_event_id;

    IF v_existing_event.withdrawal_id IS DISTINCT FROM p_withdrawal_id
       OR v_existing_event.provider_payout_id IS DISTINCT FROM v_provider_payout_id
       OR v_existing_event.status IS DISTINCT FROM p_status
       OR v_existing_event.amount_sen IS DISTINCT FROM p_amount_sen
       OR v_existing_event.currency IS DISTINCT FROM p_currency
       OR v_existing_event.provider_occurred_at IS DISTINCT FROM p_provider_occurred_at THEN
      RAISE EXCEPTION 'provider_event_conflict';
    END IF;

    v_final_status := CASE WHEN p_status = 'paid' THEN 'paid' ELSE 'failed' END;
    IF v_request.status IS DISTINCT FROM v_final_status THEN
      RAISE EXCEPTION 'provider_event_state_conflict';
    END IF;
    RETURN jsonb_build_object(
      'request_id', p_withdrawal_id,
      'user_id', v_request.user_id,
      'amount_rm', v_request.amount,
      'status', v_final_status,
      'provider', p_provider,
      'idempotent', true
    );
  END IF;

  v_result := public.complete_withdrawal_payout(
    p_withdrawal_id, v_provider_payout_id, p_status
  );

  IF p_status = 'failed' THEN
    UPDATE public.withdrawal_requests
       SET payout_failure_code = LEFT(NULLIF(BTRIM(COALESCE(p_failure_code, '')), ''), 120),
           payout_failure_message = LEFT(NULLIF(BTRIM(COALESCE(p_failure_message, '')), ''), 500),
           payout_failure_category = COALESCE(p_failure_category, 'unknown'),
           payout_failure_at = now(),
           payout_failure_retryable = COALESCE(p_retryable, false),
           updated_at = now()
     WHERE id = p_withdrawal_id;
  END IF;

  RETURN v_result || jsonb_build_object(
    'user_id', v_request.user_id,
    'amount_rm', v_request.amount,
    'provider', p_provider
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_provider_withdrawal(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BIGINT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_provider_withdrawal(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BIGINT, TEXT, TIMESTAMPTZ
) TO service_role;

-- ── Owner/Approver-safe immutable settlement proof ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_withdrawal_settlement_proof(
  p_withdrawal_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request public.withdrawal_requests%ROWTYPE;
  v_event public.payout_provider_events%ROWTYPE;
  v_outbox public.tng_mock_callback_outbox%ROWTYPE;
  v_provider TEXT;
  v_payout_id TEXT;
  v_terminal_email_type TEXT;
  v_is_approver BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  v_is_approver := public.is_approver(v_actor);

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id IS DISTINCT FROM v_actor AND NOT v_is_approver THEN
    RAISE EXCEPTION 'withdrawal_proof_forbidden';
  END IF;

  v_provider := COALESCE(v_request.payout_provider, 'stripe_connect');
  v_payout_id := CASE
    WHEN v_provider = 'tng_direct_credit' THEN v_request.payout_provider_event_id
    ELSE v_request.stripe_payout_id
  END;

  SELECT * INTO v_event
    FROM public.payout_provider_events
   WHERE withdrawal_id = p_withdrawal_id
   ORDER BY received_at DESC
   LIMIT 1;

  SELECT * INTO v_outbox
    FROM public.tng_mock_callback_outbox
   WHERE withdrawal_id = p_withdrawal_id
   ORDER BY created_at DESC
   LIMIT 1;

  v_terminal_email_type := CASE v_request.status
    WHEN 'paid' THEN 'withdrawal_paid'
    WHEN 'failed' THEN 'withdrawal_failed'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'state', v_request.status,
    'provider', v_provider,
    'providerPayoutReference', CASE
      WHEN v_payout_id IS NULL THEN NULL
      ELSE '••••••••' || RIGHT(v_payout_id, 4)
    END,
    'event', CASE WHEN v_event.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_event.event_id,
      'status', v_event.status,
      'amountSen', v_event.amount_sen,
      'currency', v_event.currency,
      'providerOccurredAt', v_event.provider_occurred_at,
      'receivedAt', v_event.received_at,
      'signatureVerified', true,
      'payloadSha256', v_event.payload_sha256
    ) END,
    'moneyMovement', jsonb_build_object(
      'amountSen', ROUND(v_request.amount * 100)::BIGINT,
      'from', 'reserved_earnings',
      'to', CASE
        WHEN v_request.status IN ('paid', 'completed') THEN 'withdrawn_earnings'
        WHEN v_request.status = 'failed' THEN 'earnings'
        ELSE NULL
      END
    ),
    'ledger', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', transaction.id,
        'type', transaction.type,
        'direction', transaction.direction,
        'amountSen', transaction.amount_sen,
        'createdAt', transaction.created_at
      ) ORDER BY transaction.created_at)
      FROM public.wallet_transactions AS transaction
      WHERE transaction.withdrawal_id = p_withdrawal_id
        AND transaction.type IN ('withdrawal_reserve', 'withdrawal_complete', 'withdrawal_cancel')
    ), '[]'::jsonb),
    'delivery', CASE WHEN NOT v_is_approver OR v_outbox.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', v_outbox.status,
      'attempts', v_outbox.attempt_count,
      'deliveredAt', v_outbox.delivered_at,
      'lastErrorCode', v_outbox.last_error_code,
      'needsReconciliation', (
        v_outbox.status = 'exhausted'
        OR (v_request.status = 'processing' AND v_outbox.updated_at < now() - interval '5 minutes')
      )
    ) END,
    'notification', CASE WHEN NOT v_is_approver OR v_terminal_email_type IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object(
        'eventType', email.event_type,
        'emailStatus', email.status,
        'queuedAt', email.created_at,
        'sentAt', email.sent_at
      )
      FROM public.email_outbox AS email
      WHERE email.event_key = v_terminal_email_type || ':' || p_withdrawal_id::TEXT
      LIMIT 1
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_withdrawal_settlement_proof(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_settlement_proof(UUID)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
