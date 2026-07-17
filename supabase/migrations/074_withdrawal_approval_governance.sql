-- 074_withdrawal_approval_governance.sql
-- Additive only. Do not edit 073.
-- Adds two-person approval state machine, high-risk override, escalation and
-- monthly reporting. Every function derives the actor from auth.uid().

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Prevents the same approver recording the same decision twice on one request.
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_approvals_one_decision_per_actor
  ON public.withdrawal_approvals (request_id, approver_id, action)
  WHERE action IN ('approve', 'reject', 'hold');

-- Faster pending/status queue scans used by the admin list route.
CREATE INDEX IF NOT EXISTS withdrawal_requests_review_queue_idx
  ON public.withdrawal_requests (status, created_at DESC);

-- ── assess_withdrawal_risk ───────────────────────────────────────────────────
-- Reads only factual DB fields (KYC, payout capability, amounts, history).
-- Never reads or returns KYC file paths or raw document numbers.
-- Upserts one withdrawal_risk_assessments row and returns {risk_level, snapshot, assessed_at}.

CREATE OR REPLACE FUNCTION public.assess_withdrawal_risk(
  p_withdrawal_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor             UUID := auth.uid();
  v_request           withdrawal_requests%ROWTYPE;
  v_user              RECORD;
  v_threshold_sen     BIGINT;
  v_amount_sen        BIGINT;
  v_recent_failed     INT;
  v_active_count      INT;
  v_account_age_days  INT;
  v_risk_level        TEXT;
  v_snapshot          JSONB;
  v_assessed_at       TIMESTAMPTZ := now();
  v_existing_override TIMESTAMPTZ;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.is_approver(v_actor) THEN
    RAISE EXCEPTION 'approver_required';
  END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  SELECT kyc_status, stripe_payouts_enabled, created_at
    INTO v_user
    FROM public.users
   WHERE id = v_request.user_id;

  SELECT COALESCE(value::BIGINT, 50000)
    INTO v_threshold_sen
    FROM public.platform_settings
   WHERE key = 'withdrawal.dual_approval_threshold_sen';

  v_amount_sen := ROUND(v_request.amount * 100)::BIGINT;

  SELECT COUNT(*)::INT INTO v_recent_failed
    FROM public.withdrawal_requests
   WHERE user_id = v_request.user_id
     AND status IN ('failed', 'rejected')
     AND created_at >= now() - INTERVAL '30 days';

  SELECT COUNT(*)::INT INTO v_active_count
    FROM public.withdrawal_requests
   WHERE user_id = v_request.user_id
     AND status IN ('pending','pending_second_approval','approved','processing','hold','overdue');

  v_account_age_days := GREATEST(0, EXTRACT(DAY FROM now() - v_user.created_at)::INT);

  -- Risk rules — mirrors computeRiskLevel in lib/wallet/withdrawal-risk.ts
  IF v_user.kyc_status <> 'approved'
     OR NOT COALESCE(v_user.stripe_payouts_enabled, false)
     OR v_recent_failed >= 3
     OR v_active_count > 1
  THEN
    v_risk_level := 'high';
  ELSIF v_amount_sen >= COALESCE(v_threshold_sen, 50000)
     OR v_recent_failed >= 1
     OR v_account_age_days < 30
  THEN
    v_risk_level := 'review';
  ELSE
    v_risk_level := 'low';
  END IF;

  v_snapshot := jsonb_build_object(
    'kyc_status',                  v_user.kyc_status,
    'payouts_enabled',             COALESCE(v_user.stripe_payouts_enabled, false),
    'amount_sen',                  v_amount_sen,
    'dual_approval_threshold_sen', COALESCE(v_threshold_sen, 50000),
    'recent_failed_count',         v_recent_failed,
    'active_request_count',        v_active_count,
    'account_age_days',            v_account_age_days
  );

  -- Preserve override fields when reassessing. If already overridden, skip the
  -- risk_level/snapshot update (override stands until Super Admin changes it).
  SELECT overridden_at INTO v_existing_override
    FROM public.withdrawal_risk_assessments
   WHERE withdrawal_id = p_withdrawal_id;

  INSERT INTO public.withdrawal_risk_assessments
    (withdrawal_id, risk_level, snapshot, assessed_at)
  VALUES
    (p_withdrawal_id, v_risk_level, v_snapshot, v_assessed_at)
  ON CONFLICT (withdrawal_id) DO UPDATE
    SET risk_level  = EXCLUDED.risk_level,
        snapshot    = EXCLUDED.snapshot,
        assessed_at = EXCLUDED.assessed_at
  WHERE withdrawal_risk_assessments.overridden_at IS NULL;

  -- Return current row (post-upsert or existing-overridden).
  SELECT risk_level, snapshot, assessed_at
    INTO v_risk_level, v_snapshot, v_assessed_at
    FROM public.withdrawal_risk_assessments
   WHERE withdrawal_id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'risk_level',  v_risk_level,
    'snapshot',    v_snapshot,
    'assessed_at', v_assessed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assess_withdrawal_risk(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assess_withdrawal_risk(UUID) TO authenticated;

-- ── override_withdrawal_risk ─────────────────────────────────────────────────
-- Super Admin only. Records a moderated override reason on an existing high-risk
-- assessment. Override is not an approval and never reduces the approval count
-- requirement. The route performs Gemini moderation before calling this RPC;
-- this RPC is a second length/role boundary only.

CREATE OR REPLACE FUNCTION public.override_withdrawal_risk(
  p_withdrawal_id UUID,
  p_reason        TEXT,
  p_ip            INET DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_request withdrawal_requests%ROWTYPE;
  v_risk    withdrawal_risk_assessments%ROWTYPE;
  v_now     TIMESTAMPTZ := now();
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  IF char_length(BTRIM(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'override_reason_too_short';
  END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = v_actor THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status NOT IN (
    'pending','pending_second_approval','approved','hold','overdue'
  ) THEN
    RAISE EXCEPTION 'withdrawal_not_overridable';
  END IF;

  SELECT * INTO v_risk
    FROM public.withdrawal_risk_assessments
   WHERE withdrawal_id = p_withdrawal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'risk_not_assessed'; END IF;
  IF v_risk.risk_level <> 'high' THEN RAISE EXCEPTION 'risk_not_high'; END IF;

  UPDATE public.withdrawal_risk_assessments
     SET overridden_by   = v_actor,
         override_reason = BTRIM(p_reason),
         overridden_at   = v_now
   WHERE withdrawal_id = p_withdrawal_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note)
  VALUES (
    v_actor, 'withdrawal.risk_overridden', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('risk_level', v_risk.risk_level, 'overridden_at', null),
    jsonb_build_object('risk_level', 'review', 'overridden_at', v_now),
    p_ip, p_reason
  );

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (
    v_request.user_id,
    'withdrawal_risk_reviewed',
    'Withdrawal risk review completed',
    'Your withdrawal has passed an additional risk review and is awaiting final approval.',
    '/customer/wallet'
  );

  RETURN jsonb_build_object(
    'request_id',   p_withdrawal_id,
    'risk_level',   'review',
    'overridden_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.override_withdrawal_risk(UUID, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.override_withdrawal_risk(UUID, TEXT, INET) TO authenticated;

-- ── approve_wallet_withdrawal ────────────────────────────────────────────────
-- Two-person approval state machine. Derives actor from auth.uid().
-- Decision order per plan Task 2 Step 5.

CREATE OR REPLACE FUNCTION public.approve_wallet_withdrawal(
  p_withdrawal_id UUID,
  p_note          TEXT DEFAULT NULL,
  p_ip            INET DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor            UUID := auth.uid();
  v_request          withdrawal_requests%ROWTYPE;
  v_wallet           wallets%ROWTYPE;
  v_user             RECORD;
  v_threshold_sen    BIGINT;
  v_amount_sen       BIGINT;
  v_recent_failed    INT;
  v_active_count     INT;
  v_account_age_days INT;
  v_risk_level       TEXT;
  v_snapshot         JSONB;
  v_risk_overridden  BOOLEAN;
  v_approve_count    INT;
  v_final_status     TEXT;
  v_ready            BOOLEAN;
  v_required         INT;
  v_trimmed_note     TEXT;
BEGIN
  -- 1. Auth
  IF v_actor IS NULL OR NOT public.is_approver(v_actor) THEN
    RAISE EXCEPTION 'approver_required';
  END IF;

  -- Note validation: absent = ok; present but empty = treat as absent;
  -- present and non-empty = must be 10-500 chars.
  IF p_note IS NOT NULL THEN
    v_trimmed_note := BTRIM(p_note);
    IF char_length(v_trimmed_note) = 0 THEN
      v_trimmed_note := NULL;
    ELSIF char_length(v_trimmed_note) < 10 OR char_length(v_trimmed_note) > 500 THEN
      RAISE EXCEPTION 'note_length_invalid';
    END IF;
  END IF;

  -- 2. Lock request and wallet
  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = v_actor THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status NOT IN ('pending', 'pending_second_approval') THEN
    RAISE EXCEPTION 'withdrawal_not_approvable';
  END IF;

  SELECT * INTO v_wallet
    FROM public.wallets
   WHERE id = v_request.wallet_id
   FOR UPDATE;

  -- 3. Inline risk computation (avoids double-locking withdrawal_requests
  --    that would occur if we called assess_withdrawal_risk here).
  SELECT kyc_status, stripe_payouts_enabled, created_at
    INTO v_user
    FROM public.users
   WHERE id = v_request.user_id;

  SELECT COALESCE(value::BIGINT, 50000)
    INTO v_threshold_sen
    FROM public.platform_settings
   WHERE key = 'withdrawal.dual_approval_threshold_sen';

  v_amount_sen := ROUND(v_request.amount * 100)::BIGINT;

  SELECT COUNT(*)::INT INTO v_recent_failed
    FROM public.withdrawal_requests
   WHERE user_id = v_request.user_id
     AND status IN ('failed', 'rejected')
     AND created_at >= now() - INTERVAL '30 days';

  SELECT COUNT(*)::INT INTO v_active_count
    FROM public.withdrawal_requests
   WHERE user_id = v_request.user_id
     AND status IN ('pending','pending_second_approval','approved','processing','hold','overdue');

  v_account_age_days := GREATEST(0, EXTRACT(DAY FROM now() - v_user.created_at)::INT);

  IF v_user.kyc_status <> 'approved'
     OR NOT COALESCE(v_user.stripe_payouts_enabled, false)
     OR v_recent_failed >= 3
     OR v_active_count > 1
  THEN
    v_risk_level := 'high';
  ELSIF v_amount_sen >= COALESCE(v_threshold_sen, 50000)
     OR v_recent_failed >= 1
     OR v_account_age_days < 30
  THEN
    v_risk_level := 'review';
  ELSE
    v_risk_level := 'low';
  END IF;

  v_snapshot := jsonb_build_object(
    'kyc_status',                  v_user.kyc_status,
    'payouts_enabled',             COALESCE(v_user.stripe_payouts_enabled, false),
    'amount_sen',                  v_amount_sen,
    'dual_approval_threshold_sen', COALESCE(v_threshold_sen, 50000),
    'recent_failed_count',         v_recent_failed,
    'active_request_count',        v_active_count,
    'account_age_days',            v_account_age_days
  );

  -- Upsert risk assessment (preserve existing override).
  SELECT ra.overridden_at IS NOT NULL INTO v_risk_overridden
    FROM public.withdrawal_risk_assessments ra
   WHERE ra.withdrawal_id = p_withdrawal_id;

  INSERT INTO public.withdrawal_risk_assessments
    (withdrawal_id, risk_level, snapshot, assessed_at)
  VALUES (p_withdrawal_id, v_risk_level, v_snapshot, now())
  ON CONFLICT (withdrawal_id) DO UPDATE
    SET risk_level  = EXCLUDED.risk_level,
        snapshot    = EXCLUDED.snapshot,
        assessed_at = EXCLUDED.assessed_at
  WHERE withdrawal_risk_assessments.overridden_at IS NULL;

  -- After upsert, re-read actual stored risk_level (may differ if overridden).
  SELECT ra.risk_level, ra.overridden_at IS NOT NULL
    INTO v_risk_level, v_risk_overridden
    FROM public.withdrawal_risk_assessments ra
   WHERE ra.withdrawal_id = p_withdrawal_id;

  IF v_risk_level = 'high' AND NOT COALESCE(v_risk_overridden, false) THEN
    RAISE EXCEPTION 'high_risk_override_required';
  END IF;

  -- 4 & 5. Insert approval row (unique index raises unique_violation on duplicate).
  BEGIN
    INSERT INTO public.withdrawal_approvals(request_id, approver_id, action, note)
    VALUES (p_withdrawal_id, v_actor, 'approve', v_trimmed_note);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_approved_by_this_actor';
  END;

  -- 6. Count distinct approvers and determine readiness.
  SELECT COUNT(DISTINCT approver_id)::INT
    INTO v_approve_count
    FROM public.withdrawal_approvals
   WHERE request_id = p_withdrawal_id
     AND action = 'approve';

  v_required := CASE WHEN v_request.requires_dual_approval THEN 2 ELSE 1 END;

  IF NOT v_request.requires_dual_approval OR v_approve_count >= 2 THEN
    v_final_status := 'approved';
    v_ready        := true;
  ELSE
    v_final_status := 'pending_second_approval';
    v_ready        := false;
  END IF;

  UPDATE public.withdrawal_requests
     SET status = v_final_status, updated_at = NOW()
   WHERE id = p_withdrawal_id;

  -- 7. Audit + notify customer.
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note)
  VALUES (
    v_actor, 'withdrawal.approval_recorded', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('status', v_request.status, 'approval_count', v_approve_count - 1),
    jsonb_build_object('status', v_final_status, 'approval_count', v_approve_count, 'ready', v_ready),
    p_ip, v_trimmed_note
  );

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (
    v_request.user_id,
    CASE WHEN v_ready THEN 'withdrawal_approved' ELSE 'withdrawal_second_approval_pending' END,
    CASE WHEN v_ready
         THEN 'Withdrawal approved — payout in progress'
         ELSE 'Withdrawal partially approved — awaiting second review' END,
    CASE WHEN v_ready
         THEN 'Your withdrawal has been approved and will be transferred to your account shortly.'
         ELSE 'Your withdrawal has received its first approval and requires one more review.' END,
    '/customer/wallet'
  );

  RETURN jsonb_build_object(
    'request_id',        p_withdrawal_id,
    'status',            v_final_status,
    'ready',             v_ready,
    'approval_count',    v_approve_count,
    'required_approvals', v_required,
    'risk_level',        v_risk_level,
    'user_id',           v_request.user_id,
    'amount_rm',         v_request.amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_wallet_withdrawal(UUID, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_wallet_withdrawal(UUID, TEXT, INET) TO authenticated;

-- ── mark_withdrawal_processing ───────────────────────────────────────────────
-- Called by the approve route after both Stripe IDs are confirmed.
-- Idempotent: identical call returns existing result; mismatched IDs conflict.

CREATE OR REPLACE FUNCTION public.mark_withdrawal_processing(
  p_withdrawal_id UUID,
  p_transfer_id   TEXT,
  p_payout_id     TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_request withdrawal_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_approver(v_actor) THEN
    RAISE EXCEPTION 'approver_required';
  END IF;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  -- Idempotent retry: already processing with the same IDs.
  IF v_request.status = 'processing'
     AND v_request.stripe_transfer_id = p_transfer_id
     AND v_request.stripe_payout_id   = p_payout_id
  THEN
    RETURN jsonb_build_object(
      'request_id', p_withdrawal_id, 'status', 'processing',
      'transfer_id', p_transfer_id, 'payout_id', p_payout_id, 'idempotent', true
    );
  END IF;

  -- Conflict: processing with different IDs.
  IF v_request.status = 'processing' THEN
    RAISE EXCEPTION 'processing_stripe_id_conflict';
  END IF;

  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION 'withdrawal_not_approved';
  END IF;

  -- Verify still approved (approval count and risk check).
  DECLARE
    v_approve_count INT;
    v_required      INT;
    v_risk_level    TEXT;
    v_risk_override BOOLEAN;
  BEGIN
    SELECT COUNT(DISTINCT approver_id)::INT
      INTO v_approve_count
      FROM public.withdrawal_approvals
     WHERE request_id = p_withdrawal_id AND action = 'approve';

    SELECT requires_dual_approval INTO v_required FROM public.withdrawal_requests WHERE id = p_withdrawal_id;
    v_required := CASE WHEN v_required THEN 2 ELSE 1 END;

    IF v_approve_count < v_required THEN
      RAISE EXCEPTION 'insufficient_approvals';
    END IF;

    SELECT ra.risk_level, ra.overridden_at IS NOT NULL
      INTO v_risk_level, v_risk_override
      FROM public.withdrawal_risk_assessments ra
     WHERE ra.withdrawal_id = p_withdrawal_id;

    IF v_risk_level = 'high' AND NOT COALESCE(v_risk_override, false) THEN
      RAISE EXCEPTION 'high_risk_override_required';
    END IF;
  END;

  UPDATE public.withdrawal_requests
     SET status             = 'processing',
         stripe_transfer_id = p_transfer_id,
         stripe_payout_id   = p_payout_id,
         updated_at         = NOW()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (
    v_actor, 'withdrawal.processing_started', 'withdrawal', p_withdrawal_id,
    jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'processing', 'transfer_id', p_transfer_id, 'payout_id', p_payout_id)
  );

  RETURN jsonb_build_object(
    'request_id', p_withdrawal_id, 'status', 'processing',
    'transfer_id', p_transfer_id, 'payout_id', p_payout_id, 'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_withdrawal_processing(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_withdrawal_processing(UUID, TEXT, TEXT) TO authenticated;

-- ── complete_withdrawal_payout ───────────────────────────────────────────────
-- Called by the Stripe webhook handler. Accepts 'paid'/'completed' or 'failed'.
-- Exactly-once: no-op on repeated calls with the same terminal result.

CREATE OR REPLACE FUNCTION public.complete_withdrawal_payout(
  p_withdrawal_id UUID,
  p_payout_id     TEXT,
  p_status        TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request    withdrawal_requests%ROWTYPE;
  v_wallet     wallets%ROWTYPE;
  v_amount_sen BIGINT;
  v_final      TEXT;
BEGIN
  IF p_status NOT IN ('paid', 'completed', 'failed') THEN
    RAISE EXCEPTION 'invalid_payout_status';
  END IF;
  v_final := CASE WHEN p_status IN ('paid', 'completed') THEN 'paid' ELSE 'failed' END;

  SELECT * INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  -- Idempotent: same terminal result.
  IF v_request.status = v_final THEN
    RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', v_final, 'idempotent', true);
  END IF;

  IF v_request.status NOT IN ('processing', 'approved') THEN
    RAISE EXCEPTION 'withdrawal_not_settleable';
  END IF;

  v_amount_sen := ROUND(v_request.amount * 100)::BIGINT;

  SELECT * INTO v_wallet
    FROM public.wallets
   WHERE id = v_request.wallet_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  IF v_final = 'paid' THEN
    -- Move reserved → withdrawn.
    IF v_wallet.reserved_earnings_sen < v_amount_sen THEN
      RAISE EXCEPTION 'withdrawal_reserve_missing';
    END IF;
    UPDATE public.wallets
       SET reserved_earnings_sen  = reserved_earnings_sen  - v_amount_sen,
           withdrawn_earnings_sen = withdrawn_earnings_sen + v_amount_sen,
           updated_at             = NOW()
     WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id,
       idempotency_key, note)
    VALUES
      (v_request.user_id, v_wallet.id, 'withdrawal_complete', v_amount_sen,
       'earnings', 'debit', p_withdrawal_id,
       'withdrawal_complete:' || p_withdrawal_id,
       'Withdrawal payout completed')
    ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

  ELSE
    -- Restore earnings from reserve.
    UPDATE public.wallets
       SET earnings_sen          = earnings_sen          + v_amount_sen,
           reserved_earnings_sen = reserved_earnings_sen - v_amount_sen,
           updated_at            = NOW()
     WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id,
       idempotency_key, note)
    VALUES
      (v_request.user_id, v_wallet.id, 'withdrawal_cancel', v_amount_sen,
       'earnings', 'credit', p_withdrawal_id,
       'withdrawal_cancel:' || p_withdrawal_id,
       'Withdrawal payout failed — earnings returned')
    ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.withdrawal_requests
     SET status     = v_final,
         updated_at = NOW()
   WHERE id = p_withdrawal_id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    NULL, 'withdrawal.' || v_final, 'withdrawal', p_withdrawal_id,
    jsonb_build_object('status', v_request.status, 'payout_id', p_payout_id),
    jsonb_build_object('status', v_final, 'amount_sen', v_amount_sen),
    'Stripe payout ' || p_status
  );

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (
    v_request.user_id,
    CASE WHEN v_final = 'paid' THEN 'withdrawal_paid' ELSE 'withdrawal_failed' END,
    CASE WHEN v_final = 'paid'
         THEN 'Payout sent to your account'
         ELSE 'Withdrawal payout failed' END,
    CASE WHEN v_final = 'paid'
         THEN 'Your withdrawal has been transferred. Please check your bank account within 1–3 business days.'
         ELSE 'Your withdrawal payout failed. Your balance has been restored. Please contact support.' END,
    '/customer/wallet'
  );

  RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', v_final, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_withdrawal_payout(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal_payout(UUID, TEXT, TEXT) TO service_role;

-- ── escalate_withdrawals ─────────────────────────────────────────────────────
-- Reads escalation_hours and hold_escalation_hours from platform_settings.
-- Transitions only eligible pending/hold requests to overdue, then notifies once.
-- Idempotent: re-running at the same time returns 0 additional transitions.

CREATE OR REPLACE FUNCTION public.escalate_withdrawals(
  p_now TIMESTAMPTZ DEFAULT now()
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_escalation_hours      BIGINT;
  v_hold_escalation_hours BIGINT;
  v_rec                   withdrawal_requests%ROWTYPE;
  v_escalated             INT := 0;
BEGIN
  SELECT COALESCE(value::BIGINT, 48)
    INTO v_escalation_hours
    FROM public.platform_settings
   WHERE key = 'withdrawal.escalation_hours';

  SELECT COALESCE(value::BIGINT, 168)
    INTO v_hold_escalation_hours
    FROM public.platform_settings
   WHERE key = 'withdrawal.hold_escalation_hours';

  FOR v_rec IN
    SELECT * FROM public.withdrawal_requests
     WHERE (
       status IN ('pending', 'pending_second_approval')
       AND created_at <= p_now - (COALESCE(v_escalation_hours, 48) || ' hours')::INTERVAL
     ) OR (
       status = 'hold'
       AND updated_at <= p_now - (COALESCE(v_hold_escalation_hours, 168) || ' hours')::INTERVAL
     )
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.withdrawal_requests
       SET overdue_from_status = v_rec.status,
           status              = 'overdue',
           updated_at          = p_now
     WHERE id = v_rec.id;

    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
    VALUES (
      NULL, 'withdrawal.escalated', 'withdrawal', v_rec.id,
      jsonb_build_object('status', v_rec.status),
      jsonb_build_object('status', 'overdue'),
      'Auto-escalated after ' || COALESCE(v_escalation_hours, 48) || 'h'
    );

    -- Notify customer.
    INSERT INTO public.notifications(user_id, type, title, body, link)
    VALUES (
      v_rec.user_id, 'withdrawal_overdue',
      'Withdrawal review is taking longer than expected',
      'Your withdrawal is under extended review. Our team will contact you if additional information is needed.',
      '/customer/wallet'
    );

    v_escalated := v_escalated + 1;
  END LOOP;

  RETURN v_escalated;
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_withdrawals(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.escalate_withdrawals(TIMESTAMPTZ) TO service_role;

-- ── generate_monthly_payout_report ───────────────────────────────────────────
-- Aggregates immutable withdrawal/ledger data in Asia/Kuala_Lumpur.
-- Upserts by period; second call returns the same row.
-- Only service_role or Super Admin may call.

CREATE OR REPLACE FUNCTION public.generate_monthly_payout_report(
  p_period_start DATE,
  p_generated_by TEXT DEFAULT 'scheduler'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_period_end DATE;
  v_summary    JSONB;
  v_report_id  UUID;
BEGIN
  -- Service role passes null actor; Super Admin passes their UID.
  IF v_actor IS NOT NULL AND NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  IF p_generated_by NOT IN ('scheduler', 'super_admin') THEN
    RAISE EXCEPTION 'invalid_generated_by';
  END IF;

  v_period_end := (p_period_start + INTERVAL '1 month')::DATE;

  SELECT jsonb_build_object(
    'total_requested',  COUNT(*),
    'total_approved',   COUNT(*) FILTER (WHERE status IN ('approved','processing','paid','completed')),
    'total_rejected',   COUNT(*) FILTER (WHERE status = 'rejected'),
    'total_completed',  COUNT(*) FILTER (WHERE status IN ('paid','completed')),
    'total_failed',     COUNT(*) FILTER (WHERE status = 'failed'),
    'pending_count',    COUNT(*) FILTER (WHERE status IN ('pending','pending_second_approval','hold','overdue')),
    'amount_requested_rm',  COALESCE(SUM(amount), 0),
    'amount_approved_rm',   COALESCE(SUM(amount) FILTER (WHERE status IN ('approved','processing','paid','completed')), 0),
    'amount_paid_rm',       COALESCE(SUM(amount) FILTER (WHERE status IN ('paid','completed')), 0),
    'amount_rejected_rm',   COALESCE(SUM(amount) FILTER (WHERE status = 'rejected'), 0),
    'amount_failed_rm',     COALESCE(SUM(amount) FILTER (WHERE status = 'failed'), 0),
    'high_risk_count',  (
      SELECT COUNT(*) FROM public.withdrawal_risk_assessments ra
       WHERE ra.withdrawal_id IN (
         SELECT id FROM public.withdrawal_requests
          WHERE (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE >= p_period_start
            AND (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE < v_period_end
       ) AND ra.risk_level = 'high'
    )
  )
  INTO v_summary
  FROM public.withdrawal_requests
  WHERE (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE >= p_period_start
    AND (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE < v_period_end;

  INSERT INTO public.monthly_payout_reports
    (period_start, timezone, summary, generated_at, generated_by)
  VALUES
    (p_period_start, 'Asia/Kuala_Lumpur', v_summary, now(), p_generated_by)
  ON CONFLICT (period_start) DO UPDATE
    SET summary      = EXCLUDED.summary,
        generated_at = EXCLUDED.generated_at,
        generated_by = EXCLUDED.generated_by
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object(
    'report_id',    v_report_id,
    'period_start', p_period_start,
    'period_end',   v_period_end,
    'summary',      v_summary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_monthly_payout_report(DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_monthly_payout_report(DATE, TEXT) TO service_role;
-- Super Admin calls via internal route using service_role client.
