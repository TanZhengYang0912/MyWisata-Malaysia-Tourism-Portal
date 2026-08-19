-- Provider-neutral withdrawal invariants, destination verification boundary,
-- provider-aware risk review, and append-only audit history.

-- ── Terminal withdrawal identifiers must match the selected provider ────────

ALTER TABLE public.withdrawal_requests
  DROP CONSTRAINT IF EXISTS wr_terminal_has_stripe_ids;

ALTER TABLE public.withdrawal_requests
  DROP CONSTRAINT IF EXISTS wr_terminal_has_provider_reference;

ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT wr_terminal_has_provider_reference
  CHECK (
    status NOT IN ('processing', 'paid', 'completed')
    OR (
      COALESCE(payout_provider, 'stripe_connect') = 'stripe_connect'
      AND stripe_transfer_id IS NOT NULL
      AND stripe_payout_id IS NOT NULL
    )
    OR (
      payout_provider = 'tng_direct_credit'
      AND payout_provider_event_id IS NOT NULL
    )
  );

-- ── Customers can read destinations, but only trusted server code verifies ─

DROP POLICY IF EXISTS payout_dest_own ON public.payout_destinations;
DROP POLICY IF EXISTS payout_dest_owner_read ON public.payout_destinations;
CREATE POLICY payout_dest_owner_read
  ON public.payout_destinations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.payout_destinations
  FROM anon, authenticated;
GRANT SELECT ON TABLE public.payout_destinations TO authenticated;

CREATE OR REPLACE FUNCTION public.save_verified_payout_destination(
  p_user_id UUID,
  p_dest_type TEXT,
  p_provider TEXT,
  p_provider_reference TEXT,
  p_label TEXT,
  p_masked_ref TEXT,
  p_is_default BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_destination public.payout_destinations%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF p_dest_type NOT IN ('bank', 'ewallet') THEN RAISE EXCEPTION 'destination_type_invalid'; END IF;
  IF p_provider NOT IN ('stripe_connect', 'tng_direct_credit') THEN RAISE EXCEPTION 'payout_provider_unsupported'; END IF;
  IF (p_dest_type = 'bank' AND p_provider <> 'stripe_connect')
     OR (p_dest_type = 'ewallet' AND p_provider <> 'tng_direct_credit') THEN
    RAISE EXCEPTION 'payout_provider_mismatch';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_provider_reference, '')), '') IS NULL
     OR char_length(p_provider_reference) > 255 THEN
    RAISE EXCEPTION 'provider_reference_invalid';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_masked_ref, '')), '') IS NULL
     OR char_length(p_masked_ref) > 80 THEN
    RAISE EXCEPTION 'masked_reference_invalid';
  END IF;

  IF COALESCE(p_is_default, false) THEN
    UPDATE public.payout_destinations
       SET is_default = false, updated_at = now()
     WHERE user_id = p_user_id AND is_default = true;
  END IF;

  INSERT INTO public.payout_destinations(
    user_id, dest_type, provider, provider_reference, label, masked_ref,
    verification_status, verified_at, is_default, updated_at
  ) VALUES (
    p_user_id, p_dest_type, p_provider, BTRIM(p_provider_reference),
    LEFT(NULLIF(BTRIM(COALESCE(p_label, '')), ''), 100),
    LEFT(BTRIM(p_masked_ref), 80), 'verified', now(), COALESCE(p_is_default, false), now()
  )
  ON CONFLICT (user_id, provider, provider_reference)
    WHERE provider_reference IS NOT NULL
  DO UPDATE SET
    label = EXCLUDED.label,
    masked_ref = EXCLUDED.masked_ref,
    verification_status = 'verified',
    verified_at = now(),
    disabled_at = NULL,
    is_default = EXCLUDED.is_default,
    updated_at = now()
  RETURNING * INTO v_destination;

  RETURN jsonb_build_object(
    'id', v_destination.id,
    'dest_type', v_destination.dest_type,
    'provider', v_destination.provider,
    'label', v_destination.label,
    'masked_ref', v_destination.masked_ref,
    'verification_status', v_destination.verification_status,
    'is_default', v_destination.is_default,
    'cooldown_until', v_destination.cooldown_until
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_verified_payout_destination(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_verified_payout_destination(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role;

-- ── Audit history is append-only through application roles ──────────────────

CREATE OR REPLACE FUNCTION public.audit_logs_are_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs_append_only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_are_append_only();

REVOKE UPDATE, DELETE ON TABLE public.audit_logs
  FROM anon, authenticated, service_role;

-- ── Provider-aware approval risk assessment ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_wallet_withdrawal(
  p_withdrawal_id UUID,
  p_note TEXT DEFAULT NULL,
  p_ip INET DEFAULT NULL,
  p_reason_category TEXT DEFAULT 'review_completed'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request withdrawal_requests%ROWTYPE;
  v_user RECORD;
  v_threshold_sen BIGINT;
  v_amount_sen BIGINT;
  v_recent_failed INT;
  v_active_count INT;
  v_account_age_days INT;
  v_risk_level TEXT;
  v_snapshot JSONB;
  v_risk_overridden BOOLEAN;
  v_approve_count INT;
  v_final_status TEXT;
  v_ready BOOLEAN;
  v_required INT;
  v_note TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.is_approver(v_actor) THEN RAISE EXCEPTION 'approver_required'; END IF;
  v_note := NULLIF(BTRIM(p_note), '');
  IF v_note IS NOT NULL AND (char_length(v_note) < 10 OR char_length(v_note) > 500) THEN RAISE EXCEPTION 'note_length_invalid'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason_category, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_category_required'; END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = v_actor THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status NOT IN ('pending', 'pending_second_approval') THEN RAISE EXCEPTION 'withdrawal_not_approvable'; END IF;
  v_amount_sen := ROUND(v_request.amount * 100)::BIGINT;
  SELECT kyc_status, stripe_payouts_enabled, created_at INTO v_user FROM public.users WHERE id = v_request.user_id;
  SELECT COALESCE(value::BIGINT, 50000) INTO v_threshold_sen FROM public.platform_settings WHERE key = 'withdrawal.dual_approval_threshold_sen';
  SELECT COUNT(*)::INT INTO v_recent_failed FROM public.withdrawal_requests WHERE user_id = v_request.user_id AND status IN ('failed', 'rejected') AND created_at >= now() - INTERVAL '30 days';
  SELECT COUNT(*)::INT INTO v_active_count FROM public.withdrawal_requests WHERE user_id = v_request.user_id AND status IN ('pending','pending_second_approval','approved','processing','hold','overdue');
  v_account_age_days := GREATEST(0, EXTRACT(DAY FROM now() - v_user.created_at)::INT);
  IF v_user.kyc_status <> 'approved'
     OR (
       COALESCE(v_request.payout_provider, 'stripe_connect') = 'stripe_connect'
       AND NOT COALESCE(v_user.stripe_payouts_enabled, false)
     )
     OR v_recent_failed >= 3 OR v_active_count > 1 THEN v_risk_level := 'high';
  ELSIF v_amount_sen >= COALESCE(v_threshold_sen, 50000) OR v_recent_failed >= 1 OR v_account_age_days < 30 THEN v_risk_level := 'review';
  ELSE v_risk_level := 'low'; END IF;
  v_snapshot := jsonb_build_object(
    'kyc_status', v_user.kyc_status,
    'payout_provider', COALESCE(v_request.payout_provider, 'stripe_connect'),
    'payouts_enabled', CASE
      WHEN COALESCE(v_request.payout_provider, 'stripe_connect') = 'stripe_connect'
        THEN COALESCE(v_user.stripe_payouts_enabled, false)
      ELSE true
    END,
    'amount_sen', v_amount_sen,
    'approval_cycle', v_request.approval_cycle,
    'recent_failed_count', v_recent_failed,
    'active_request_count', v_active_count,
    'account_age_days', v_account_age_days
  );
  SELECT overridden_at IS NOT NULL INTO v_risk_overridden FROM public.withdrawal_risk_assessments WHERE withdrawal_id = p_withdrawal_id;
  INSERT INTO public.withdrawal_risk_assessments(withdrawal_id, risk_level, snapshot, assessed_at) VALUES (p_withdrawal_id, v_risk_level, v_snapshot, now())
  ON CONFLICT (withdrawal_id) DO UPDATE SET risk_level = EXCLUDED.risk_level, snapshot = EXCLUDED.snapshot, assessed_at = EXCLUDED.assessed_at WHERE withdrawal_risk_assessments.overridden_at IS NULL;
  SELECT risk_level, overridden_at IS NOT NULL INTO v_risk_level, v_risk_overridden FROM public.withdrawal_risk_assessments WHERE withdrawal_id = p_withdrawal_id;
  IF v_risk_level = 'high' AND NOT COALESCE(v_risk_overridden, false) THEN RAISE EXCEPTION 'high_risk_override_required'; END IF;
  BEGIN
    INSERT INTO public.withdrawal_approvals(request_id, approver_id, action, note, approval_cycle, reason_category) VALUES (p_withdrawal_id, v_actor, 'approve', v_note, v_request.approval_cycle, p_reason_category);
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'already_approved_by_this_actor'; END;
  SELECT COUNT(DISTINCT approver_id)::INT INTO v_approve_count FROM public.withdrawal_approvals WHERE request_id = p_withdrawal_id AND approval_cycle = v_request.approval_cycle AND action = 'approve';
  v_required := CASE WHEN v_request.requires_dual_approval THEN 2 ELSE 1 END;
  v_ready := NOT v_request.requires_dual_approval OR v_approve_count >= v_required;
  v_final_status := CASE WHEN v_ready THEN 'approved' ELSE 'pending_second_approval' END;
  UPDATE public.withdrawal_requests SET status = v_final_status, updated_at = NOW() WHERE id = p_withdrawal_id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note) VALUES (v_actor, 'withdrawal.approval_recorded', 'withdrawal', p_withdrawal_id, jsonb_build_object('status', v_request.status, 'approval_count', v_approve_count - 1, 'approval_cycle', v_request.approval_cycle), jsonb_build_object('status', v_final_status, 'approval_count', v_approve_count, 'approval_cycle', v_request.approval_cycle, 'ready', v_ready), p_ip, v_note);
  INSERT INTO public.notifications(user_id, type, title, body, link, event_key, category, metadata) VALUES (v_request.user_id, CASE WHEN v_ready THEN 'withdrawal_approved' ELSE 'withdrawal_second_approval_pending' END, CASE WHEN v_ready THEN 'Withdrawal approved — payout in progress' ELSE 'Withdrawal partially approved — awaiting second review' END, CASE WHEN v_ready THEN 'Your withdrawal has been approved and will be transferred to your selected payout destination shortly.' ELSE 'Your withdrawal has received its first approval and requires one more review.' END, '/customer/wallet', 'withdrawal_approval:' || p_withdrawal_id::text || ':' || v_request.approval_cycle::text || ':' || v_approve_count::text, 'wallet', jsonb_build_object('withdrawal_id', p_withdrawal_id, 'approval_cycle', v_request.approval_cycle, 'approval_count', v_approve_count));
  RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', v_final_status, 'ready', v_ready, 'approval_count', v_approve_count, 'required_approvals', v_required, 'risk_level', v_risk_level, 'user_id', v_request.user_id, 'amount_rm', v_request.amount, 'approval_cycle', v_request.approval_cycle);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_wallet_withdrawal(UUID, TEXT, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_wallet_withdrawal(UUID, TEXT, INET, TEXT) TO authenticated;

-- ── Explicit payout retry without creating another approval ────────────────

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

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note
  ) VALUES (
    p_actor_id,
    'withdrawal.payout_retry_requested',
    'withdrawal',
    p_withdrawal_id,
    jsonb_build_object('status', v_request.status, 'provider_event_id', v_request.payout_provider_event_id),
    jsonb_build_object('status', v_request.status, 'reason_category', p_reason_category),
    p_ip,
    v_note
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

-- ── Provider-neutral terminal settlement and customer notification ─────────

CREATE OR REPLACE FUNCTION public.complete_withdrawal_payout(
  p_withdrawal_id UUID,
  p_payout_id TEXT,
  p_status TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request public.withdrawal_requests%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_amount_sen BIGINT;
  v_final TEXT;
  v_provider TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_status NOT IN ('paid', 'completed', 'failed') THEN RAISE EXCEPTION 'invalid_payout_status'; END IF;
  v_final := CASE WHEN p_status IN ('paid', 'completed') THEN 'paid' ELSE 'failed' END;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  v_provider := COALESCE(v_request.payout_provider, 'stripe_connect');

  IF v_request.status = v_final THEN
    RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', v_final, 'idempotent', true);
  END IF;
  IF v_request.status NOT IN ('processing', 'approved') THEN RAISE EXCEPTION 'withdrawal_not_settleable'; END IF;

  IF v_provider = 'stripe_connect' AND v_request.stripe_payout_id IS DISTINCT FROM p_payout_id THEN
    RAISE EXCEPTION 'provider_payout_id_conflict';
  END IF;
  IF v_provider = 'tng_direct_credit' AND v_request.payout_provider_event_id IS DISTINCT FROM p_payout_id THEN
    RAISE EXCEPTION 'provider_payout_id_conflict';
  END IF;

  v_amount_sen := ROUND(v_request.amount * 100)::BIGINT;
  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_request.wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_wallet.reserved_earnings_sen < v_amount_sen THEN RAISE EXCEPTION 'withdrawal_reserve_missing'; END IF;

  IF v_final = 'paid' THEN
    UPDATE public.wallets
       SET reserved_earnings_sen = reserved_earnings_sen - v_amount_sen,
           withdrawn_earnings_sen = withdrawn_earnings_sen + v_amount_sen,
           updated_at = now()
     WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions(
      user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, idempotency_key, note
    ) VALUES (
      v_request.user_id, v_wallet.id, 'withdrawal_complete', v_amount_sen,
      'earnings', 'debit', p_withdrawal_id,
      'withdrawal_complete:' || p_withdrawal_id, 'Withdrawal payout completed'
    ) ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  ELSE
    UPDATE public.wallets
       SET earnings_sen = earnings_sen + v_amount_sen,
           reserved_earnings_sen = reserved_earnings_sen - v_amount_sen,
           updated_at = now()
     WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions(
      user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, idempotency_key, note
    ) VALUES (
      v_request.user_id, v_wallet.id, 'withdrawal_cancel', v_amount_sen,
      'earnings', 'credit', p_withdrawal_id,
      'withdrawal_cancel:' || p_withdrawal_id, 'Withdrawal payout failed — earnings returned'
    ) ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.withdrawal_requests SET status = v_final, updated_at = now()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    NULL, 'withdrawal.' || v_final, 'withdrawal', p_withdrawal_id,
    jsonb_build_object('status', v_request.status, 'payout_id', p_payout_id),
    jsonb_build_object('status', v_final, 'amount_sen', v_amount_sen, 'provider', v_provider),
    'Provider payout ' || p_status
  );

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (
    v_request.user_id,
    CASE WHEN v_final = 'paid' THEN 'withdrawal_paid' ELSE 'withdrawal_failed' END,
    CASE WHEN v_final = 'paid' THEN 'Payout sent to your account' ELSE 'Withdrawal payout failed' END,
    CASE WHEN v_final = 'paid'
      THEN 'Your withdrawal has been transferred to your selected payout destination.'
      ELSE 'Your withdrawal payout failed. Your balance has been restored. Please contact support.' END,
    '/customer/wallet'
  );

  RETURN jsonb_build_object(
    'request_id', p_withdrawal_id,
    'status', v_final,
    'provider', v_provider,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_withdrawal_payout(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal_payout(UUID, TEXT, TEXT)
  TO service_role;

-- ── Preserve reconciliation response shape with provider-aware semantics ─────

CREATE OR REPLACE FUNCTION public.check_data_integrity()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_issues JSONB;
  v_withdrawal_issues JSONB;
  v_commission_issues JSONB;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin_required'; END IF;

  SELECT jsonb_agg(row_to_json(t)) INTO v_wallet_issues
  FROM (
    SELECT w.user_id, w.earnings_sen AS stored_earnings_sen,
      COALESCE(SUM(CASE WHEN wt.bucket = 'earnings' AND wt.direction = 'credit' THEN wt.amount_sen WHEN wt.bucket = 'earnings' AND wt.direction = 'debit' AND wt.type <> 'withdrawal_complete' THEN -wt.amount_sen ELSE 0 END), 0) AS ledger_earnings_sen,
      w.pending_earnings_sen AS stored_pending_sen,
      COALESCE(SUM(CASE WHEN wt.bucket = 'pending_earnings' AND wt.direction = 'credit' THEN wt.amount_sen WHEN wt.bucket = 'pending_earnings' AND wt.direction = 'debit' THEN -wt.amount_sen ELSE 0 END), 0) AS ledger_pending_sen,
      w.topup_sen AS stored_topup_sen,
      COALESCE(SUM(CASE WHEN wt.bucket = 'topup' AND wt.direction = 'credit' THEN wt.amount_sen WHEN wt.bucket = 'topup' AND wt.direction = 'debit' THEN -wt.amount_sen ELSE 0 END), 0) AS ledger_topup_sen
    FROM public.wallets w LEFT JOIN public.wallet_transactions wt ON wt.wallet_id = w.id
    GROUP BY w.user_id, w.earnings_sen, w.pending_earnings_sen, w.topup_sen
    HAVING w.earnings_sen <> COALESCE(SUM(CASE WHEN wt.bucket = 'earnings' AND wt.direction = 'credit' THEN wt.amount_sen WHEN wt.bucket = 'earnings' AND wt.direction = 'debit' AND wt.type <> 'withdrawal_complete' THEN -wt.amount_sen ELSE 0 END), 0)
      OR w.pending_earnings_sen <> COALESCE(SUM(CASE WHEN wt.bucket = 'pending_earnings' AND wt.direction = 'credit' THEN wt.amount_sen WHEN wt.bucket = 'pending_earnings' AND wt.direction = 'debit' THEN -wt.amount_sen ELSE 0 END), 0)
      OR w.topup_sen <> COALESCE(SUM(CASE WHEN wt.bucket = 'topup' AND wt.direction = 'credit' THEN wt.amount_sen WHEN wt.bucket = 'topup' AND wt.direction = 'debit' THEN -wt.amount_sen ELSE 0 END), 0)
  ) t;

  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'status', status, 'amount', amount, 'payout_provider', payout_provider,
    'stripe_transfer_id', stripe_transfer_id, 'stripe_payout_id', stripe_payout_id,
    'payout_provider_event_id', payout_provider_event_id
  )) INTO v_withdrawal_issues
  FROM public.withdrawal_requests
  WHERE status IN ('processing', 'paid', 'completed') AND NOT (
    (COALESCE(payout_provider, 'stripe_connect') = 'stripe_connect' AND stripe_transfer_id IS NOT NULL AND stripe_payout_id IS NOT NULL)
    OR (payout_provider = 'tng_direct_credit' AND payout_provider_event_id IS NOT NULL)
  );

  SELECT jsonb_agg(jsonb_build_object(
    'commission_id', rc.id, 'recommender_id', rc.recommender_id,
    'commission_type', rc.commission_type, 'amount', rc.amount,
    'commission_status', rc.status, 'attribution_ends_at', conv.attribution_ends_at
  )) INTO v_commission_issues
  FROM public.recommendation_commissions rc
  JOIN public.recommendation_conversions conv ON conv.id = rc.conversion_id
  WHERE rc.status = 'pending' AND conv.attribution_ends_at IS NOT NULL AND conv.attribution_ends_at < now();

  RETURN jsonb_build_object(
    'wallet_ledger_imbalances', COALESCE(v_wallet_issues, '[]'::jsonb),
    'processing_without_stripe_ids', COALESCE(v_withdrawal_issues, '[]'::jsonb),
    'pending_commissions_expired', COALESCE(v_commission_issues, '[]'::jsonb),
    'checked_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_data_integrity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_data_integrity() TO authenticated;
