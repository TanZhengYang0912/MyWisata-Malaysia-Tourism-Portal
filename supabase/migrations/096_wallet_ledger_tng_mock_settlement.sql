-- 096_wallet_ledger_tng_mock_settlement.sql
-- Application-level ledger immutability and non-production TNG mock settlement.
-- This migration does not provide a live TNG transport.

-- ── Append-only wallet history ──────────────────────────────────────────────

REVOKE INSERT, UPDATE, DELETE ON TABLE public.wallet_transactions
  FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.wallet_transactions_are_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'wallet_transactions_append_only';
END;
$$;

DROP TRIGGER IF EXISTS wallet_transactions_append_only ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_append_only
  BEFORE UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.wallet_transactions_are_append_only();

-- ── Append-only provider callback receipt ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payout_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES public.withdrawal_requests(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('stripe_connect', 'tng_direct_credit')),
  event_id TEXT NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 255),
  provider_payout_id TEXT NOT NULL CHECK (char_length(provider_payout_id) BETWEEN 1 AND 255),
  status TEXT NOT NULL CHECK (status IN ('paid', 'failed')),
  failure_code TEXT,
  failure_category TEXT,
  failure_retryable BOOLEAN NOT NULL DEFAULT FALSE,
  payload_sha256 TEXT CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$'),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS payout_provider_events_withdrawal_idx
  ON public.payout_provider_events(withdrawal_id, received_at DESC);

ALTER TABLE public.payout_provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payout_provider_events
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.payout_provider_events_are_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'payout_provider_events_append_only';
END;
$$;

DROP TRIGGER IF EXISTS payout_provider_events_append_only ON public.payout_provider_events;
CREATE TRIGGER payout_provider_events_append_only
  BEFORE UPDATE OR DELETE ON public.payout_provider_events
  FOR EACH ROW EXECUTE FUNCTION public.payout_provider_events_are_append_only();

-- ── Provider-neutral approved -> processing transition ──────────────────────

CREATE OR REPLACE FUNCTION public.mark_provider_withdrawal_processing(
  p_withdrawal_id UUID,
  p_provider TEXT,
  p_provider_payout_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request withdrawal_requests%ROWTYPE;
  v_required INTEGER;
  v_approve_count INTEGER;
  v_risk_level TEXT;
  v_risk_overridden BOOLEAN;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_provider <> 'tng_direct_credit' THEN
    RAISE EXCEPTION 'payout_provider_unsupported';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_provider_payout_id, '')), '') IS NULL
     OR char_length(p_provider_payout_id) > 255 THEN
    RAISE EXCEPTION 'provider_payout_id_invalid';
  END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.payout_provider IS DISTINCT FROM p_provider THEN
    RAISE EXCEPTION 'payout_provider_mismatch';
  END IF;

  IF v_request.status = 'processing'
     AND v_request.payout_provider_event_id = p_provider_payout_id THEN
    RETURN jsonb_build_object(
      'request_id', p_withdrawal_id,
      'status', 'processing',
      'idempotent', true
    );
  END IF;
  IF v_request.status = 'processing'
     OR v_request.payout_provider_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'provider_payout_id_conflict';
  END IF;
  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION 'withdrawal_not_approved';
  END IF;

  v_required := CASE WHEN v_request.requires_dual_approval THEN 2 ELSE 1 END;
  SELECT COUNT(DISTINCT approver_id)::INTEGER INTO v_approve_count
    FROM public.withdrawal_approvals
   WHERE request_id = p_withdrawal_id
     AND approval_cycle = v_request.approval_cycle
     AND action = 'approve';
  IF v_approve_count < v_required THEN
    RAISE EXCEPTION 'approval_count_insufficient';
  END IF;

  SELECT risk_level, overridden_at IS NOT NULL
    INTO v_risk_level, v_risk_overridden
    FROM public.withdrawal_risk_assessments
   WHERE withdrawal_id = p_withdrawal_id;
  IF v_risk_level = 'high' AND NOT COALESCE(v_risk_overridden, false) THEN
    RAISE EXCEPTION 'high_risk_override_required';
  END IF;

  UPDATE public.withdrawal_requests
     SET status = 'processing',
         payout_provider_event_id = p_provider_payout_id,
         updated_at = now()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    NULL,
    'withdrawal.processing_started',
    'withdrawal',
    p_withdrawal_id,
    jsonb_build_object(
      'status', 'approved',
      'approval_cycle', v_request.approval_cycle
    ),
    jsonb_build_object(
      'status', 'processing',
      'provider', p_provider,
      'provider_payout_id', p_provider_payout_id
    ),
    'Provider payout created'
  );

  RETURN jsonb_build_object(
    'request_id', p_withdrawal_id,
    'status', 'processing',
    'provider', p_provider,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_provider_withdrawal_processing(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_provider_withdrawal_processing(UUID, TEXT, TEXT)
  TO service_role;

-- ── Signed provider callback -> atomic wallet settlement ────────────────────

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
  p_payload_sha256 TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request withdrawal_requests%ROWTYPE;
  v_existing_event payout_provider_events%ROWTYPE;
  v_inserted_event_id UUID;
  v_result JSONB;
  v_final_status TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_provider <> 'tng_direct_credit' THEN
    RAISE EXCEPTION 'payout_provider_unsupported';
  END IF;
  IF p_status NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'invalid_payout_status';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_event_id, '')), '') IS NULL
     OR char_length(p_event_id) > 255 THEN
    RAISE EXCEPTION 'provider_event_id_invalid';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_provider_payout_id, '')), '') IS NULL
     OR char_length(p_provider_payout_id) > 255 THEN
    RAISE EXCEPTION 'provider_payout_id_invalid';
  END IF;
  IF p_payload_sha256 IS NOT NULL
     AND p_payload_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'payload_hash_invalid';
  END IF;
  IF p_failure_category IS NOT NULL
     AND p_failure_category NOT IN (
       'invalid_destination', 'account_disabled', 'provider_rejected',
       'timeout', 'not_configured', 'unknown'
     ) THEN
    RAISE EXCEPTION 'failure_category_invalid';
  END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.payout_provider IS DISTINCT FROM p_provider THEN
    RAISE EXCEPTION 'payout_provider_mismatch';
  END IF;
  IF v_request.payout_provider_event_id IS DISTINCT FROM p_provider_payout_id THEN
    RAISE EXCEPTION 'provider_payout_id_conflict';
  END IF;

  INSERT INTO public.payout_provider_events(
    withdrawal_id,
    provider,
    event_id,
    provider_payout_id,
    status,
    failure_code,
    failure_category,
    failure_retryable,
    payload_sha256
  ) VALUES (
    p_withdrawal_id,
    p_provider,
    LEFT(BTRIM(p_event_id), 255),
    LEFT(BTRIM(p_provider_payout_id), 255),
    p_status,
    LEFT(NULLIF(BTRIM(COALESCE(p_failure_code, '')), ''), 120),
    p_failure_category,
    COALESCE(p_retryable, false),
    p_payload_sha256
  )
  ON CONFLICT (provider, event_id) DO NOTHING
  RETURNING id INTO v_inserted_event_id;

  IF v_inserted_event_id IS NULL THEN
    SELECT * INTO v_existing_event
      FROM public.payout_provider_events
     WHERE provider = p_provider AND event_id = p_event_id;

    IF v_existing_event.withdrawal_id IS DISTINCT FROM p_withdrawal_id
       OR v_existing_event.provider_payout_id IS DISTINCT FROM p_provider_payout_id
       OR v_existing_event.status IS DISTINCT FROM p_status THEN
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
      'idempotent', true
    );
  END IF;

  v_result := public.complete_withdrawal_payout(
    p_withdrawal_id,
    p_provider_payout_id,
    p_status
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
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_provider_withdrawal(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT
) TO service_role;
