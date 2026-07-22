-- 079_wallet_hold_resume_notifications.sql
-- Additive Wallet Hold/Resume, Wallet-reason moderation metadata, and
-- idempotent customer notification/email primitives.

-- ── Withdrawal approval cycles and reason metadata ─────────────────────────
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS approval_cycle INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS customer_reason_category TEXT;

ALTER TABLE public.withdrawal_approvals
  ADD COLUMN IF NOT EXISTS approval_cycle INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reason_category TEXT;

UPDATE public.withdrawal_approvals
   SET approval_cycle = 1
 WHERE approval_cycle IS NULL;

-- A decision can be recorded once per approver per approval cycle and action.
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_approvals_one_decision_per_cycle_actor
  ON public.withdrawal_approvals (request_id, approval_cycle, approver_id, action);

-- ── Support linkage ────────────────────────────────────────────────────────
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS withdrawal_id UUID
  REFERENCES public.withdrawal_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_tickets_withdrawal_idx
  ON public.support_tickets(withdrawal_id, created_at DESC)
  WHERE withdrawal_id IS NOT NULL;

-- ── Notification idempotency and category metadata ─────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_key TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique
  ON public.notifications(event_key)
  WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications(user_id, created_at DESC);

-- ── Metadata-only Wallet moderation attempts ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_moderation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.users(id),
  withdrawal_id UUID REFERENCES public.withdrawal_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'hold', 'reject', 'resume', 'approve', 'fraud_override',
    'adjustment', 'settings', 'approver_role'
  )),
  reason_category TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN (
    'accepted', 'flagged', 'irrelevant', 'unavailable', 'invalid'
  )),
  model_categories TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_moderation_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_moderation_attempts_service_only
  ON public.wallet_moderation_attempts;
CREATE POLICY wallet_moderation_attempts_service_only
  ON public.wallet_moderation_attempts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS wallet_moderation_attempts_rate_idx
  ON public.wallet_moderation_attempts(actor_id, withdrawal_id, action, created_at DESC);

-- ── Email outbox event vocabulary ──────────────────────────────────────────
ALTER TABLE public.email_outbox
  DROP CONSTRAINT IF EXISTS email_outbox_event_type_check;

ALTER TABLE public.email_outbox
  ADD CONSTRAINT email_outbox_event_type_check CHECK (event_type IN (
    'checkout_succeeded', 'topup_succeeded', 'topup_failed', 'topup_refunded',
    'withdrawal_submitted', 'withdrawal_approved', 'withdrawal_hold',
    'withdrawal_resumed', 'withdrawal_paid', 'withdrawal_failed',
    'withdrawal_rejected', 'wallet_adjustment',
    'payout_account_connected', 'payout_account_disconnected',
    'recommendation_reward_pending', 'recommendation_reward_available',
    'recommendation_reward_reversed', 'account_suspended',
    'account_unsuspended', 'account_deleted', 'account_restored'
  ));

CREATE OR REPLACE FUNCTION public.claim_email_outbox(p_limit INTEGER DEFAULT 20)
RETURNS SETOF public.email_outbox
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH candidates AS (
    SELECT id
      FROM public.email_outbox
     WHERE status IN ('pending', 'failed')
       AND attempts < 5
       AND next_attempt_at <= now()
     ORDER BY created_at
     LIMIT GREATEST(1, LEAST(p_limit, 100))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_outbox AS e
     SET status = 'sending',
         attempts = e.attempts + 1,
         updated_at = now()
    FROM candidates
   WHERE e.id = candidates.id
  RETURNING e.*;
$$;

REVOKE ALL ON FUNCTION public.claim_email_outbox(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox(INTEGER) TO service_role;

-- ── Hold/Resume approval-cycle state machine ───────────────────────────────
-- Forward-only overrides for the older governance functions. A resumed hold
-- starts a fresh cycle; approvals from older cycles remain audit history but
-- can never satisfy the current cycle.
ALTER TABLE public.withdrawal_approvals
  DROP CONSTRAINT IF EXISTS withdrawal_approvals_action_check;
ALTER TABLE public.withdrawal_approvals
  ADD CONSTRAINT withdrawal_approvals_action_check
  CHECK (action IN ('approve', 'reject', 'hold', 'resume'));

-- Remove the previous three-argument overloads so callers cannot bypass the
-- category/cycle-aware implementations below.
DROP FUNCTION IF EXISTS public.hold_wallet_withdrawal(UUID, TEXT, INET);
DROP FUNCTION IF EXISTS public.reject_wallet_withdrawal(UUID, TEXT, INET);
DROP FUNCTION IF EXISTS public.approve_wallet_withdrawal(UUID, TEXT, INET);

CREATE OR REPLACE FUNCTION public.hold_wallet_withdrawal(
  p_id UUID,
  p_reason TEXT,
  p_ip INET DEFAULT NULL,
  p_reason_category TEXT DEFAULT 'other'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request withdrawal_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_approver(v_actor) THEN RAISE EXCEPTION 'approver_required'; END IF;
  IF char_length(BTRIM(COALESCE(p_reason, ''))) < 10 OR char_length(BTRIM(p_reason)) > 500 THEN
    RAISE EXCEPTION 'withdrawal_reason_invalid';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason_category, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_category_required'; END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = v_actor THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status NOT IN ('pending', 'pending_second_approval', 'approved', 'overdue') THEN
    RAISE EXCEPTION 'withdrawal_not_holdable';
  END IF;
  INSERT INTO public.withdrawal_approvals(request_id, approver_id, action, note, approval_cycle, reason_category)
  VALUES (p_id, v_actor, 'hold', p_reason, v_request.approval_cycle, p_reason_category);
  UPDATE public.withdrawal_requests
     SET status = 'hold', customer_reason = p_reason, customer_reason_category = p_reason_category,
         customer_visible_at = NOW(), updated_at = NOW()
   WHERE id = p_id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note)
  VALUES (v_actor, 'withdrawal.held', 'withdrawal', p_id,
          jsonb_build_object('status', v_request.status, 'approval_cycle', v_request.approval_cycle),
          jsonb_build_object('status', 'hold', 'approval_cycle', v_request.approval_cycle, 'reason_category', p_reason_category),
          p_ip, p_reason);
  INSERT INTO public.notifications(user_id, type, title, body, link, event_key, category, metadata)
  VALUES (v_request.user_id, 'withdrawal_hold', 'Withdrawal needs additional review',
          'Your withdrawal is on hold. Please provide the requested information through Support.',
          '/customer/support?withdrawal=' || p_id::text,
          'withdrawal_hold:' || p_id::text || ':' || v_request.approval_cycle::text,
          'wallet', jsonb_build_object('withdrawal_id', p_id, 'approval_cycle', v_request.approval_cycle));
  RETURN jsonb_build_object('user_id', v_request.user_id, 'amount_rm', v_request.amount, 'status', 'hold', 'approval_cycle', v_request.approval_cycle);
END;
$$;

REVOKE ALL ON FUNCTION public.hold_wallet_withdrawal(UUID, TEXT, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hold_wallet_withdrawal(UUID, TEXT, INET, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resume_wallet_withdrawal(
  p_id UUID,
  p_reason TEXT,
  p_ip INET DEFAULT NULL,
  p_reason_category TEXT DEFAULT 'other'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request withdrawal_requests%ROWTYPE;
  v_old_cycle INTEGER;
  v_new_cycle INTEGER;
BEGIN
  IF v_actor IS NULL OR NOT public.is_approver(v_actor) THEN RAISE EXCEPTION 'approver_required'; END IF;
  IF char_length(BTRIM(COALESCE(p_reason, ''))) < 10 OR char_length(BTRIM(p_reason)) > 500 THEN
    RAISE EXCEPTION 'withdrawal_reason_invalid';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason_category, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_category_required'; END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = v_actor THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status <> 'hold' THEN RAISE EXCEPTION 'withdrawal_not_resumable'; END IF;
  v_old_cycle := COALESCE(v_request.approval_cycle, 1);
  v_new_cycle := v_old_cycle + 1;
  INSERT INTO public.withdrawal_approvals(request_id, approver_id, action, note, approval_cycle, reason_category)
  VALUES (p_id, v_actor, 'resume', p_reason, v_old_cycle, p_reason_category);
  UPDATE public.withdrawal_requests
     SET status = 'pending', approval_cycle = v_new_cycle,
         customer_reason = NULL, customer_reason_category = NULL, customer_visible_at = NULL, updated_at = NOW()
   WHERE id = p_id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note)
  VALUES (v_actor, 'withdrawal.resumed', 'withdrawal', p_id,
          jsonb_build_object('status', 'hold', 'approval_cycle', v_old_cycle),
          jsonb_build_object('status', 'pending', 'approval_cycle', v_new_cycle, 'reason_category', p_reason_category),
          p_ip, p_reason);
  INSERT INTO public.notifications(user_id, type, title, body, link, event_key, category, metadata)
  VALUES (v_request.user_id, 'withdrawal_resumed', 'Withdrawal review resumed',
          'Your withdrawal review has resumed. A fresh approval review is now in progress.',
          '/customer/wallet', 'withdrawal_resumed:' || p_id::text || ':' || v_new_cycle::text,
          'wallet', jsonb_build_object('withdrawal_id', p_id, 'approval_cycle', v_new_cycle));
  RETURN jsonb_build_object('user_id', v_request.user_id, 'amount_rm', v_request.amount, 'status', 'pending', 'approval_cycle', v_new_cycle);
END;
$$;

REVOKE ALL ON FUNCTION public.resume_wallet_withdrawal(UUID, TEXT, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resume_wallet_withdrawal(UUID, TEXT, INET, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_wallet_withdrawal(
  p_id UUID,
  p_reason TEXT,
  p_ip INET DEFAULT NULL,
  p_reason_category TEXT DEFAULT 'other'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request withdrawal_requests%ROWTYPE;
  v_wallet wallets%ROWTYPE;
  v_amount_sen BIGINT;
BEGIN
  IF v_actor IS NULL OR NOT public.is_approver(v_actor) THEN RAISE EXCEPTION 'approver_required'; END IF;
  IF char_length(BTRIM(COALESCE(p_reason, ''))) < 10 OR char_length(BTRIM(p_reason)) > 500 THEN RAISE EXCEPTION 'withdrawal_reason_invalid'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason_category, '')), '') IS NULL THEN RAISE EXCEPTION 'reason_category_required'; END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = v_actor THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status NOT IN ('pending', 'pending_second_approval', 'approved', 'hold', 'overdue') THEN RAISE EXCEPTION 'withdrawal_not_rejectable'; END IF;
  v_amount_sen := ROUND(v_request.amount * 100)::BIGINT;
  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_request.wallet_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.reserved_earnings_sen < v_amount_sen THEN RAISE EXCEPTION 'withdrawal_reserve_missing'; END IF;
  INSERT INTO public.withdrawal_approvals(request_id, approver_id, action, note, approval_cycle, reason_category)
  VALUES (p_id, v_actor, 'reject', p_reason, v_request.approval_cycle, p_reason_category);
  UPDATE public.wallets SET earnings_sen = earnings_sen + v_amount_sen, reserved_earnings_sen = reserved_earnings_sen - v_amount_sen, updated_at = NOW() WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES (v_request.user_id, v_wallet.id, 'withdrawal_cancel', v_amount_sen, 'earnings', 'credit', p_id, p_reason);
  UPDATE public.withdrawal_requests SET status = 'rejected', customer_reason = p_reason, customer_reason_category = p_reason_category, customer_visible_at = NOW(), updated_at = NOW() WHERE id = p_id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note)
  VALUES (v_actor, 'withdrawal.rejected', 'withdrawal', p_id, jsonb_build_object('status', v_request.status, 'approval_cycle', v_request.approval_cycle), jsonb_build_object('status', 'rejected', 'approval_cycle', v_request.approval_cycle), p_ip, p_reason);
  INSERT INTO public.notifications(user_id, type, title, body, link, event_key, category, metadata)
  VALUES (v_request.user_id, 'withdrawal_rejected', 'Withdrawal request rejected', p_reason, '/customer/wallet', 'withdrawal_rejected:' || p_id::text || ':' || v_request.approval_cycle::text, 'wallet', jsonb_build_object('withdrawal_id', p_id));
  RETURN jsonb_build_object('user_id', v_request.user_id, 'amount_rm', v_request.amount, 'status', 'rejected', 'approval_cycle', v_request.approval_cycle);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_wallet_withdrawal(UUID, TEXT, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_wallet_withdrawal(UUID, TEXT, INET, TEXT) TO authenticated;

-- Re-create approval RPC with approval-cycle filtering. The risk calculation is
-- intentionally kept server-side; old-cycle approvals never count.
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
  IF v_user.kyc_status <> 'approved' OR NOT COALESCE(v_user.stripe_payouts_enabled, false) OR v_recent_failed >= 3 OR v_active_count > 1 THEN v_risk_level := 'high';
  ELSIF v_amount_sen >= COALESCE(v_threshold_sen, 50000) OR v_recent_failed >= 1 OR v_account_age_days < 30 THEN v_risk_level := 'review';
  ELSE v_risk_level := 'low'; END IF;
  v_snapshot := jsonb_build_object('kyc_status', v_user.kyc_status, 'payouts_enabled', COALESCE(v_user.stripe_payouts_enabled, false), 'amount_sen', v_amount_sen, 'approval_cycle', v_request.approval_cycle, 'recent_failed_count', v_recent_failed, 'active_request_count', v_active_count, 'account_age_days', v_account_age_days);
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
  INSERT INTO public.notifications(user_id, type, title, body, link, event_key, category, metadata) VALUES (v_request.user_id, CASE WHEN v_ready THEN 'withdrawal_approved' ELSE 'withdrawal_second_approval_pending' END, CASE WHEN v_ready THEN 'Withdrawal approved — payout in progress' ELSE 'Withdrawal partially approved — awaiting second review' END, CASE WHEN v_ready THEN 'Your withdrawal has been approved and will be transferred to your account shortly.' ELSE 'Your withdrawal has received its first approval and requires one more review.' END, '/customer/wallet', 'withdrawal_approval:' || p_withdrawal_id::text || ':' || v_request.approval_cycle::text || ':' || v_approve_count::text, 'wallet', jsonb_build_object('withdrawal_id', p_withdrawal_id, 'approval_cycle', v_request.approval_cycle, 'approval_count', v_approve_count));
  RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', v_final_status, 'ready', v_ready, 'approval_count', v_approve_count, 'required_approvals', v_required, 'risk_level', v_risk_level, 'user_id', v_request.user_id, 'amount_rm', v_request.amount, 'approval_cycle', v_request.approval_cycle);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_wallet_withdrawal(UUID, TEXT, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_wallet_withdrawal(UUID, TEXT, INET, TEXT) TO authenticated;

-- Existing server-side Stripe settlement function must use only the current
-- approval cycle when checking two-person approval.
CREATE OR REPLACE FUNCTION public.mark_withdrawal_processing(
  p_withdrawal_id UUID, p_transfer_id TEXT, p_payout_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request withdrawal_requests%ROWTYPE;
  v_required INTEGER;
  v_approve_count INTEGER;
  v_risk_level TEXT;
  v_risk_overridden BOOLEAN;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_transfer_id, '')), '') IS NULL OR NULLIF(BTRIM(COALESCE(p_payout_id, '')), '') IS NULL THEN RAISE EXCEPTION 'stripe_identifiers_required'; END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.status = 'processing' AND v_request.stripe_transfer_id = p_transfer_id AND v_request.stripe_payout_id = p_payout_id THEN RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', 'processing', 'idempotent', true); END IF;
  IF v_request.status = 'processing' THEN RAISE EXCEPTION 'processing_stripe_id_conflict'; END IF;
  IF v_request.status <> 'approved' THEN RAISE EXCEPTION 'withdrawal_not_approved'; END IF;
  v_required := CASE WHEN v_request.requires_dual_approval THEN 2 ELSE 1 END;
  SELECT COUNT(DISTINCT approver_id)::INTEGER INTO v_approve_count FROM public.withdrawal_approvals WHERE request_id = p_withdrawal_id AND approval_cycle = v_request.approval_cycle AND action = 'approve';
  IF v_approve_count < v_required THEN RAISE EXCEPTION 'insufficient_approvals'; END IF;
  SELECT risk_level, overridden_at IS NOT NULL INTO v_risk_level, v_risk_overridden FROM public.withdrawal_risk_assessments WHERE withdrawal_id = p_withdrawal_id;
  IF v_risk_level = 'high' AND NOT COALESCE(v_risk_overridden, false) THEN RAISE EXCEPTION 'high_risk_override_required'; END IF;
  UPDATE public.withdrawal_requests SET status = 'processing', stripe_transfer_id = p_transfer_id, stripe_payout_id = p_payout_id, updated_at = now() WHERE id = p_withdrawal_id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note) VALUES (NULL, 'withdrawal.processing_started', 'withdrawal', p_withdrawal_id, jsonb_build_object('status', 'approved', 'approval_cycle', v_request.approval_cycle), jsonb_build_object('status', 'processing', 'transfer_id', p_transfer_id, 'payout_id', p_payout_id), 'Stripe Transfer and Payout created');
  RETURN jsonb_build_object('request_id', p_withdrawal_id, 'status', 'processing', 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_withdrawal_processing(UUID, TEXT, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_withdrawal_processing(UUID, TEXT, TEXT) TO service_role;

-- Legacy notification writers predate category metadata. Normalize their rows
-- so the Bell filters remain useful without rewriting every historical RPC.
CREATE OR REPLACE FUNCTION public.normalize_wallet_notification_category()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category IS NULL THEN
    NEW.category := CASE
      WHEN NEW.type LIKE 'withdrawal_%' OR NEW.type LIKE 'wallet_%' OR NEW.type LIKE 'payout_%' OR NEW.type LIKE 'topup_%' THEN 'wallet'
      WHEN NEW.type LIKE 'recommendation_%' OR NEW.type LIKE 'affiliate_%' THEN 'recommendations_affiliate'
      WHEN NEW.type LIKE 'support_%' OR NEW.type LIKE 'ticket_%' THEN 'support'
      WHEN NEW.type LIKE 'booking_%' OR NEW.type LIKE 'checkout_%' OR NEW.type LIKE 'payment_%' THEN 'bookings_purchases'
      ELSE 'account_security'
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_category_normalizer ON public.notifications;
CREATE TRIGGER notifications_category_normalizer
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.normalize_wallet_notification_category();
