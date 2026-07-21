-- Provider failure details are normalized by the server before persistence.
-- This RPC is service-role only and is idempotent on provider event ID.

CREATE OR REPLACE FUNCTION public.record_withdrawal_payout_failure(
  p_withdrawal_id UUID,
  p_provider TEXT,
  p_provider_event_id TEXT,
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
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  IF p_provider_event_id IS NOT NULL AND v_request.payout_provider_event_id = p_provider_event_id THEN
    RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', v_request.status, 'idempotent', true);
  END IF;

  UPDATE public.withdrawal_requests
     SET payout_provider = LEFT(p_provider, 50),
         payout_provider_event_id = LEFT(p_provider_event_id, 255),
         payout_failure_code = LEFT(p_failure_code, 120),
         payout_failure_message = LEFT(p_failure_message, 500),
         payout_failure_category = p_failure_category,
         payout_failure_at = NOW(),
         payout_failure_retryable = p_retryable,
         updated_at = NOW()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    NULL, 'withdrawal.payout_failed_details', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('status', v_request.status),
    jsonb_build_object('provider', p_provider, 'event_id', p_provider_event_id, 'category', p_failure_category, 'retryable', p_retryable),
    'Normalized provider failure recorded'
  );

  RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', v_request.status, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_withdrawal_payout_failure(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_withdrawal_payout_failure(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
