-- Persist the trust decision that allowed a provider callback to settle money.

ALTER TABLE public.payout_provider_events
  ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN,
  ADD COLUMN IF NOT EXISTS verification_method TEXT,
  ADD COLUMN IF NOT EXISTS ingestion_source TEXT;

DROP TRIGGER IF EXISTS payout_provider_events_append_only ON public.payout_provider_events;
UPDATE public.payout_provider_events
   SET signature_verified = COALESCE(signature_verified, false),
       verification_method = COALESCE(verification_method, 'legacy_unverified'),
       ingestion_source = COALESCE(ingestion_source, 'migration_backfill')
 WHERE signature_verified IS NULL
    OR verification_method IS NULL
    OR ingestion_source IS NULL;
CREATE TRIGGER payout_provider_events_append_only
  BEFORE UPDATE OR DELETE ON public.payout_provider_events
  FOR EACH ROW EXECUTE FUNCTION public.payout_provider_events_are_append_only();

ALTER TABLE public.payout_provider_events
  ALTER COLUMN signature_verified SET NOT NULL,
  ALTER COLUMN signature_verified SET DEFAULT false,
  ALTER COLUMN verification_method SET NOT NULL,
  ALTER COLUMN verification_method SET DEFAULT 'unverified',
  ALTER COLUMN ingestion_source SET NOT NULL,
  ALTER COLUMN ingestion_source SET DEFAULT 'unknown';

ALTER TABLE public.payout_provider_events
  ADD CONSTRAINT payout_provider_events_verification_method_check
  CHECK (verification_method IN ('hmac_sha256', 'legacy_unverified', 'unverified'));
ALTER TABLE public.payout_provider_events
  ADD CONSTRAINT payout_provider_events_ingestion_source_check
  CHECK (ingestion_source IN ('tng_mock_webhook', 'migration_backfill', 'unknown'));

DROP FUNCTION IF EXISTS public.settle_provider_withdrawal(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BIGINT, TEXT, TIMESTAMPTZ
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
  p_provider_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_signature_verified BOOLEAN DEFAULT NULL,
  p_verification_method TEXT DEFAULT NULL,
  p_ingestion_source TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
  v_existing_event public.payout_provider_events%ROWTYPE;
  v_inserted_event_id UUID;
  v_result JSONB;
  v_final_status TEXT;
  v_event_id TEXT := btrim(COALESCE(p_event_id, ''));
  v_provider_payout_id TEXT := btrim(COALESCE(p_provider_payout_id, ''));
  v_expected_amount_sen BIGINT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_signature_verified IS DISTINCT FROM true THEN RAISE EXCEPTION 'provider_verification_required'; END IF;
  IF p_verification_method <> 'hmac_sha256' THEN RAISE EXCEPTION 'provider_verification_method_invalid'; END IF;
  IF p_ingestion_source <> 'tng_mock_webhook' THEN RAISE EXCEPTION 'provider_ingestion_source_invalid'; END IF;
  IF p_provider <> 'tng_direct_credit' THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
  IF p_status NOT IN ('paid', 'failed') THEN RAISE EXCEPTION 'invalid_payout_status'; END IF;
  IF v_event_id = '' OR char_length(v_event_id) > 255 THEN RAISE EXCEPTION 'provider_event_id_invalid'; END IF;
  IF v_provider_payout_id = '' OR char_length(v_provider_payout_id) > 255 THEN RAISE EXCEPTION 'provider_payout_id_invalid'; END IF;
  IF p_payload_sha256 IS NULL OR p_payload_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'payload_hash_invalid'; END IF;
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
  IF v_request.payout_provider_event_id IS DISTINCT FROM v_provider_payout_id THEN RAISE EXCEPTION 'provider_payout_id_conflict'; END IF;

  v_expected_amount_sen := round(v_request.amount * 100)::BIGINT;
  IF p_amount_sen IS DISTINCT FROM v_expected_amount_sen THEN RAISE EXCEPTION 'provider_amount_conflict'; END IF;
  IF p_currency IS DISTINCT FROM 'MYR' THEN RAISE EXCEPTION 'provider_currency_conflict'; END IF;

  INSERT INTO public.payout_provider_events(
    withdrawal_id, provider, event_id, provider_payout_id, status,
    failure_code, failure_category, failure_retryable, payload_sha256,
    amount_sen, currency, provider_occurred_at,
    signature_verified, verification_method, ingestion_source
  ) VALUES (
    p_withdrawal_id, p_provider, v_event_id, v_provider_payout_id, p_status,
    left(NULLIF(btrim(COALESCE(p_failure_code, '')), ''), 120),
    p_failure_category, COALESCE(p_retryable, false), p_payload_sha256,
    p_amount_sen, p_currency, p_provider_occurred_at,
    p_signature_verified, p_verification_method, p_ingestion_source
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
       OR v_existing_event.provider_occurred_at IS DISTINCT FROM p_provider_occurred_at
       OR v_existing_event.signature_verified IS DISTINCT FROM p_signature_verified
       OR v_existing_event.verification_method IS DISTINCT FROM p_verification_method
       OR v_existing_event.ingestion_source IS DISTINCT FROM p_ingestion_source THEN
      RAISE EXCEPTION 'provider_event_conflict';
    END IF;

    v_final_status := CASE WHEN p_status = 'paid' THEN 'paid' ELSE 'failed' END;
    IF v_request.status IS DISTINCT FROM v_final_status THEN RAISE EXCEPTION 'provider_event_state_conflict'; END IF;
    RETURN jsonb_build_object(
      'request_id', p_withdrawal_id,
      'user_id', v_request.user_id,
      'amount_rm', v_request.amount,
      'status', v_final_status,
      'provider', p_provider,
      'idempotent', true
    );
  END IF;

  v_result := public.complete_withdrawal_payout(p_withdrawal_id, v_provider_payout_id, p_status);

  IF p_status = 'failed' THEN
    UPDATE public.withdrawal_requests
       SET payout_failure_code = left(NULLIF(btrim(COALESCE(p_failure_code, '')), ''), 120),
           payout_failure_message = left(NULLIF(btrim(COALESCE(p_failure_message, '')), ''), 500),
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
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BIGINT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_provider_withdrawal(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BIGINT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_withdrawal_settlement_proof(
  p_withdrawal_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
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

  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id IS DISTINCT FROM v_actor AND NOT v_is_approver THEN RAISE EXCEPTION 'withdrawal_proof_forbidden'; END IF;

  v_provider := COALESCE(v_request.payout_provider, 'stripe_connect');
  v_payout_id := CASE WHEN v_provider = 'tng_direct_credit' THEN v_request.payout_provider_event_id ELSE v_request.stripe_payout_id END;

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

  v_terminal_email_type := CASE v_request.status WHEN 'paid' THEN 'withdrawal_paid' WHEN 'failed' THEN 'withdrawal_failed' ELSE NULL END;

  RETURN jsonb_build_object(
    'state', v_request.status,
    'provider', v_provider,
    'providerPayoutReference', CASE WHEN v_payout_id IS NULL THEN NULL ELSE '••••••••' || right(v_payout_id, 4) END,
    'event', CASE WHEN v_event.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_event.event_id,
      'status', v_event.status,
      'amountSen', v_event.amount_sen,
      'currency', v_event.currency,
      'providerOccurredAt', v_event.provider_occurred_at,
      'receivedAt', v_event.received_at,
      'signatureVerified', v_event.signature_verified,
      'verificationMethod', v_event.verification_method,
      'ingestionSource', v_event.ingestion_source,
      'payloadSha256', v_event.payload_sha256
    ) END,
    'moneyMovement', jsonb_build_object(
      'amountSen', round(v_request.amount * 100)::BIGINT,
      'from', 'reserved_earnings',
      'to', CASE WHEN v_request.status IN ('paid', 'completed') THEN 'withdrawn_earnings' WHEN v_request.status = 'failed' THEN 'earnings' ELSE NULL END
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

REVOKE ALL ON FUNCTION public.get_withdrawal_settlement_proof(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_settlement_proof(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
