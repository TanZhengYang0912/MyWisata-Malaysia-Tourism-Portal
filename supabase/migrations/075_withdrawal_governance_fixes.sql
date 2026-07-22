-- 075_withdrawal_governance_fixes.sql
-- Forward-only fixes for the deployed 074 withdrawal governance contract.

-- Stripe state transitions are server-only. The route uses a service-role client
-- after Stripe has returned both immutable identifiers.
CREATE OR REPLACE FUNCTION public.mark_withdrawal_processing(
  p_withdrawal_id UUID,
  p_transfer_id   TEXT,
  p_payout_id     TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request         withdrawal_requests%ROWTYPE;
  v_requires_dual  BOOLEAN;
  v_required        INTEGER;
  v_approve_count   INTEGER;
  v_risk_level      TEXT;
  v_risk_overridden BOOLEAN;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_transfer_id, '')), '') IS NULL
     OR NULLIF(BTRIM(COALESCE(p_payout_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'stripe_identifiers_required';
  END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  IF v_request.status = 'processing'
     AND v_request.stripe_transfer_id = p_transfer_id
     AND v_request.stripe_payout_id = p_payout_id THEN
    RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', 'processing', 'idempotent', true);
  END IF;
  IF v_request.status = 'processing' THEN
    RAISE EXCEPTION 'processing_stripe_id_conflict';
  END IF;
  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION 'withdrawal_not_approved';
  END IF;

  SELECT requires_dual_approval INTO v_requires_dual
    FROM public.withdrawal_requests WHERE id = p_withdrawal_id;
  v_required := CASE WHEN v_requires_dual THEN 2 ELSE 1 END;
  SELECT COUNT(DISTINCT approver_id)::INTEGER INTO v_approve_count
    FROM public.withdrawal_approvals
   WHERE request_id = p_withdrawal_id AND action = 'approve';
  IF v_approve_count < v_required THEN RAISE EXCEPTION 'insufficient_approvals'; END IF;

  SELECT risk_level, overridden_at IS NOT NULL
    INTO v_risk_level, v_risk_overridden
    FROM public.withdrawal_risk_assessments
   WHERE withdrawal_id = p_withdrawal_id;
  IF v_risk_level = 'high' AND NOT COALESCE(v_risk_overridden, false) THEN
    RAISE EXCEPTION 'high_risk_override_required';
  END IF;

  UPDATE public.withdrawal_requests
     SET status = 'processing', stripe_transfer_id = p_transfer_id,
         stripe_payout_id = p_payout_id, updated_at = now()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (NULL, 'withdrawal.processing_started', 'withdrawal', p_withdrawal_id,
          jsonb_build_object('status', 'approved'),
          jsonb_build_object('status', 'processing', 'transfer_id', p_transfer_id, 'payout_id', p_payout_id),
          'Stripe Transfer and Payout created');

  RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', 'processing', 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_withdrawal_processing(UUID, TEXT, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_withdrawal_processing(UUID, TEXT, TEXT) TO service_role;

-- Keep legacy webhook callers safe if an old deployment still invokes these
-- names. They delegate to the same reserved/withdrawn ledger transition.
CREATE OR REPLACE FUNCTION public.connect_payout_completed(p_payout_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_withdrawal_id UUID;
BEGIN
  SELECT id INTO v_withdrawal_id FROM public.withdrawal_requests
   WHERE stripe_payout_id = p_payout_id AND status = 'processing' LIMIT 1;
  IF v_withdrawal_id IS NOT NULL THEN
    PERFORM public.complete_withdrawal_payout(v_withdrawal_id, p_payout_id, 'paid');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.connect_payout_failed(p_payout_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_withdrawal_id UUID;
BEGIN
  SELECT id INTO v_withdrawal_id FROM public.withdrawal_requests
   WHERE stripe_payout_id = p_payout_id AND status = 'processing' LIMIT 1;
  IF v_withdrawal_id IS NOT NULL THEN
    PERFORM public.complete_withdrawal_payout(v_withdrawal_id, p_payout_id, 'failed');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.connect_payout_completed(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.connect_payout_failed(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connect_payout_completed(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.connect_payout_failed(TEXT) TO service_role;
