-- Forward-only payout retry safety. Provider artifacts are persisted before
-- later accounting work, and unsafe failures block application retries.

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS payout_attempt_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_execution_claim_token UUID,
  ADD COLUMN IF NOT EXISTS payout_execution_claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.start_withdrawal_payout_attempt(
  p_withdrawal_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.status <> 'approved' THEN RAISE EXCEPTION 'withdrawal_not_approved'; END IF;

  IF v_request.payout_execution_claim_token IS NOT NULL THEN
    RETURN jsonb_build_object(
      'request_id', p_withdrawal_id,
      'acquired', false,
      'started_at', v_request.payout_attempt_started_at
    );
  END IF;

  UPDATE public.withdrawal_requests
     SET payout_attempt_started_at = COALESCE(payout_attempt_started_at, now()),
         payout_execution_claim_token = gen_random_uuid(),
         payout_execution_claimed_at = now()
   WHERE id = p_withdrawal_id
   RETURNING * INTO v_request;

  RETURN jsonb_build_object(
    'request_id', p_withdrawal_id,
    'acquired', true,
    'started_at', v_request.payout_attempt_started_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_withdrawal_payout_attempt(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_withdrawal_payout_attempt(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_stripe_transfer(
  p_withdrawal_id UUID,
  p_transfer_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_transfer_id, '')), '') IS NULL OR char_length(p_transfer_id) > 255 THEN
    RAISE EXCEPTION 'stripe_transfer_id_invalid';
  END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF COALESCE(v_request.payout_provider, 'stripe_connect') <> 'stripe_connect' THEN RAISE EXCEPTION 'payout_provider_mismatch'; END IF;
  IF v_request.status <> 'approved' THEN RAISE EXCEPTION 'withdrawal_not_approved'; END IF;
  IF v_request.payout_execution_claim_token IS NULL THEN RAISE EXCEPTION 'payout_execution_claim_required'; END IF;
  IF v_request.stripe_transfer_id = p_transfer_id THEN RETURN; END IF;
  IF v_request.stripe_transfer_id IS NOT NULL THEN RAISE EXCEPTION 'stripe_transfer_id_conflict'; END IF;
  UPDATE public.withdrawal_requests SET stripe_transfer_id = BTRIM(p_transfer_id), updated_at = now()
   WHERE id = p_withdrawal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stripe_transfer(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_transfer(UUID, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_stripe_payout(
  p_withdrawal_id UUID,
  p_payout_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_payout_id, '')), '') IS NULL OR char_length(p_payout_id) > 255 THEN
    RAISE EXCEPTION 'stripe_payout_id_invalid';
  END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF COALESCE(v_request.payout_provider, 'stripe_connect') <> 'stripe_connect' THEN
    RAISE EXCEPTION 'payout_provider_mismatch';
  END IF;
  IF v_request.status <> 'approved' THEN RAISE EXCEPTION 'withdrawal_not_approved'; END IF;
  IF v_request.stripe_transfer_id IS NULL THEN RAISE EXCEPTION 'stripe_transfer_not_recorded'; END IF;
  IF v_request.payout_execution_claim_token IS NULL THEN RAISE EXCEPTION 'payout_execution_claim_required'; END IF;

  IF v_request.stripe_payout_id = p_payout_id THEN
    RETURN jsonb_build_object('request_id', p_withdrawal_id, 'payout_id', p_payout_id, 'idempotent', true);
  END IF;
  IF v_request.stripe_payout_id IS NOT NULL THEN RAISE EXCEPTION 'stripe_payout_id_conflict'; END IF;

  UPDATE public.withdrawal_requests
     SET stripe_payout_id = BTRIM(p_payout_id),
         updated_at = now()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    NULL, 'withdrawal.stripe_payout_recorded', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('status', v_request.status, 'payout_id_recorded', false),
    jsonb_build_object('status', v_request.status, 'payout_id_recorded', true),
    'Stripe payout reference persisted before fee and processing updates'
  );

  RETURN jsonb_build_object('request_id', p_withdrawal_id, 'payout_id', p_payout_id, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_stripe_payout(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_payout(UUID, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_tng_payout(
  p_withdrawal_id UUID,
  p_provider_payout_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_provider_payout_id, '')), '') IS NULL OR char_length(p_provider_payout_id) > 255 THEN
    RAISE EXCEPTION 'provider_payout_id_invalid';
  END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.payout_provider IS DISTINCT FROM 'tng_direct_credit' THEN RAISE EXCEPTION 'payout_provider_mismatch'; END IF;
  IF v_request.status <> 'approved' THEN RAISE EXCEPTION 'withdrawal_not_approved'; END IF;
  IF v_request.payout_execution_claim_token IS NULL THEN RAISE EXCEPTION 'payout_execution_claim_required'; END IF;
  IF v_request.payout_provider_event_id = p_provider_payout_id THEN
    RETURN jsonb_build_object('request_id', p_withdrawal_id, 'provider_payout_id', p_provider_payout_id, 'idempotent', true);
  END IF;
  IF v_request.payout_provider_event_id IS NOT NULL THEN RAISE EXCEPTION 'provider_payout_id_conflict'; END IF;
  UPDATE public.withdrawal_requests
     SET payout_provider_event_id = BTRIM(p_provider_payout_id), updated_at = now()
   WHERE id = p_withdrawal_id;
  RETURN jsonb_build_object('request_id', p_withdrawal_id, 'provider_payout_id', p_provider_payout_id, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_tng_payout(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tng_payout(UUID, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_provider_withdrawal_processing(
  p_withdrawal_id UUID,
  p_provider TEXT,
  p_provider_payout_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
  v_required INTEGER;
  v_approve_count INTEGER;
  v_risk_level TEXT;
  v_risk_overridden BOOLEAN;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_provider <> 'tng_direct_credit' THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_provider_payout_id, '')), '') IS NULL OR char_length(p_provider_payout_id) > 255 THEN
    RAISE EXCEPTION 'provider_payout_id_invalid';
  END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.payout_provider IS DISTINCT FROM p_provider THEN RAISE EXCEPTION 'payout_provider_mismatch'; END IF;
  IF v_request.status = 'processing' AND v_request.payout_provider_event_id = p_provider_payout_id THEN
    RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', 'processing', 'idempotent', true);
  END IF;
  IF v_request.status = 'processing' THEN RAISE EXCEPTION 'provider_payout_id_conflict'; END IF;
  IF v_request.status <> 'approved' THEN RAISE EXCEPTION 'withdrawal_not_approved'; END IF;
  IF v_request.payout_provider_event_id IS DISTINCT FROM p_provider_payout_id THEN RAISE EXCEPTION 'provider_payout_id_conflict'; END IF;

  v_required := CASE WHEN v_request.requires_dual_approval THEN 2 ELSE 1 END;
  SELECT COUNT(DISTINCT approver_id)::INTEGER INTO v_approve_count
    FROM public.withdrawal_approvals
   WHERE request_id = p_withdrawal_id
     AND approval_cycle = v_request.approval_cycle
     AND action = 'approve';
  IF v_approve_count < v_required THEN RAISE EXCEPTION 'approval_count_insufficient'; END IF;
  SELECT risk_level, overridden_at IS NOT NULL INTO v_risk_level, v_risk_overridden
    FROM public.withdrawal_risk_assessments WHERE withdrawal_id = p_withdrawal_id;
  IF v_risk_level = 'high' AND NOT COALESCE(v_risk_overridden, false) THEN RAISE EXCEPTION 'high_risk_override_required'; END IF;

  UPDATE public.withdrawal_requests
     SET status = 'processing',
         payout_execution_claim_token = NULL,
         payout_execution_claimed_at = NULL,
         updated_at = now()
   WHERE id = p_withdrawal_id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (NULL, 'withdrawal.processing_started', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('status', 'approved', 'approval_cycle', v_request.approval_cycle),
    jsonb_build_object('status', 'processing', 'provider', p_provider, 'provider_payout_id', p_provider_payout_id),
    'Provider payout created');
  RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', 'processing', 'provider', p_provider, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_provider_withdrawal_processing(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_provider_withdrawal_processing(UUID, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_withdrawal_execution_failure(
  p_withdrawal_id UUID,
  p_provider TEXT,
  p_failure_code TEXT,
  p_failure_message TEXT,
  p_failure_category TEXT,
  p_retryable BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_provider NOT IN ('stripe_connect', 'tng_direct_credit') THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
  IF p_failure_category NOT IN (
    'invalid_destination', 'account_disabled', 'provider_rejected',
    'timeout', 'not_configured', 'unknown'
  ) THEN RAISE EXCEPTION 'failure_category_invalid'; END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.status <> 'approved' THEN RAISE EXCEPTION 'withdrawal_not_approved'; END IF;
  IF COALESCE(v_request.payout_provider, 'stripe_connect') <> p_provider THEN RAISE EXCEPTION 'payout_provider_mismatch'; END IF;

  UPDATE public.withdrawal_requests
     SET payout_failure_code = LEFT(NULLIF(BTRIM(COALESCE(p_failure_code, '')), ''), 120),
         payout_failure_message = LEFT(NULLIF(BTRIM(COALESCE(p_failure_message, '')), ''), 500),
         payout_failure_category = p_failure_category,
         payout_failure_at = now(),
         payout_failure_retryable = p_retryable,
         payout_attempt_started_at = CASE
           WHEN p_retryable
            AND stripe_transfer_id IS NULL
            AND stripe_payout_id IS NULL
            AND payout_provider_event_id IS NULL
           THEN NULL ELSE payout_attempt_started_at END,
         payout_execution_claim_token = CASE WHEN p_retryable THEN NULL ELSE payout_execution_claim_token END,
         payout_execution_claimed_at = CASE WHEN p_retryable THEN NULL ELSE payout_execution_claimed_at END,
         updated_at = now()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    NULL, 'withdrawal.execution_failed', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('status', v_request.status),
    jsonb_build_object('status', v_request.status, 'provider', p_provider, 'category', p_failure_category, 'retryable', p_retryable),
    'Safe payout execution failure recorded'
  );

  RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', v_request.status, 'retryable', p_retryable);
END;
$$;

REVOKE ALL ON FUNCTION public.record_withdrawal_execution_failure(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_withdrawal_execution_failure(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role;

CREATE OR REPLACE FUNCTION public.clear_withdrawal_execution_failure(
  p_withdrawal_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  UPDATE public.withdrawal_requests
     SET payout_failure_code = NULL,
         payout_failure_message = NULL,
         payout_failure_category = NULL,
         payout_failure_at = NULL,
         payout_failure_retryable = NULL,
         payout_execution_claim_token = NULL,
         payout_execution_claimed_at = NULL,
         updated_at = now()
   WHERE id = p_withdrawal_id
     AND status IN ('approved', 'processing');
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_clearable'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_withdrawal_execution_failure(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_withdrawal_execution_failure(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_withdrawal_payout_retry(
  p_withdrawal_id UUID,
  p_actor_id UUID,
  p_note TEXT,
  p_ip INET DEFAULT NULL,
  p_reason_category TEXT DEFAULT 'payout_ready'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
  v_note TEXT := NULLIF(BTRIM(p_note), '');
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_actor_id IS NULL OR NOT public.is_approver(p_actor_id) THEN RAISE EXCEPTION 'approver_required'; END IF;
  IF v_note IS NULL OR char_length(v_note) < 10 OR char_length(v_note) > 500 THEN RAISE EXCEPTION 'note_length_invalid'; END IF;
  IF p_reason_category NOT IN ('review_completed', 'payout_ready', 'other') THEN RAISE EXCEPTION 'reason_category_invalid'; END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = p_actor_id THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status <> 'approved' THEN RAISE EXCEPTION 'withdrawal_not_retryable'; END IF;
  IF v_request.payout_failure_retryable IS FALSE THEN RAISE EXCEPTION 'payout_reconciliation_required'; END IF;
  IF v_request.payout_execution_claim_token IS NOT NULL THEN RAISE EXCEPTION 'payout_execution_in_progress'; END IF;

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note
  ) VALUES (
    p_actor_id, 'withdrawal.payout_retry_requested', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('status', v_request.status, 'provider_event_id', v_request.payout_provider_event_id),
    jsonb_build_object('status', v_request.status, 'reason_category', p_reason_category),
    p_ip, v_note
  );

  RETURN jsonb_build_object(
    'request_id', p_withdrawal_id,
    'status', v_request.status,
    'payout_provider', COALESCE(v_request.payout_provider, 'stripe_connect')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_withdrawal_payout_retry(UUID, UUID, TEXT, INET, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_withdrawal_payout_retry(UUID, UUID, TEXT, INET, TEXT)
  TO service_role;
