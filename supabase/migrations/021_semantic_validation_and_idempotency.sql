-- ============================================================
-- 021_semantic_validation_and_idempotency.sql — PR 021:
-- P0 Semantic Validation + P1 Remaining Idempotency
--
-- P0 — Self-dealing prevention (5 admin RPCs):
--   · record_admin_approval        — admin cannot approve their own withdrawal
--   · admin_reject_withdrawal      — admin cannot reject their own withdrawal
--   · admin_review_kyc             — admin cannot review their own KYC
--   · admin_review_recommendation  — admin cannot review their own recommendation
--   · admin_link_vendor_recommendation — admin cannot link their own recommendation
--                                       + unique active conversion window per vendor
--
-- P0 — Minimum withdrawal amount:
--   · debit_withdrawal reads platform_settings.withdrawal.min_amount_sen
--   · platform_settings row: withdrawal.min_amount_sen = 1000 (RM 10)
--
-- P1 — Pending withdrawal uniqueness:
--   · UNIQUE INDEX: one pending withdrawal per user at a time
--   · debit_withdrawal raises pending_withdrawal_exists if violated
-- ============================================================


-- ── 0. Pre-flight check — existing violations would block index creation ────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM withdrawal_requests
    WHERE  status = 'pending'
    GROUP  BY user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Migration 021 blocked: duplicate pending withdrawal_requests rows exist per user. '
      'Resolve before re-running.';
  END IF;
END $$;


-- ── 1. Platform setting: minimum withdrawal amount ────────────────────────────
INSERT INTO platform_settings (key, value, description)
SELECT 'withdrawal.min_amount_sen', '1000',
       'Minimum withdrawal amount in sen (100 = RM 1). Default RM 10.'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE key = 'withdrawal.min_amount_sen'
);


-- ── 2. Unique index: one pending withdrawal per user ─────────────────────────
-- Prevents a user from submitting a second withdrawal while one is still pending.
-- debit_withdrawal will raise pending_withdrawal_exists if this index is violated.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_withdrawal_per_user
  ON withdrawal_requests (user_id)
  WHERE status = 'pending';


-- ── 3. debit_withdrawal — min amount check + pending uniqueness message ───────
CREATE OR REPLACE FUNCTION debit_withdrawal(
  p_user_id   UUID,
  p_amount_rm NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id      UUID;
  v_earnings       BIGINT;
  v_amount_sen     BIGINT;
  v_min_amount_sen BIGINT;
  v_request_id     UUID;
  v_dual           BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized'; END IF;

  v_amount_sen := ROUND(p_amount_rm * 100)::BIGINT;
  IF v_amount_sen <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;

  -- Min amount from platform settings (fallback RM 10 = 1000 sen)
  SELECT COALESCE(value::BIGINT, 1000) INTO v_min_amount_sen
    FROM platform_settings WHERE key = 'withdrawal.min_amount_sen';
  v_min_amount_sen := COALESCE(v_min_amount_sen, 1000);

  IF v_amount_sen < v_min_amount_sen THEN
    RAISE EXCEPTION 'below_min_withdrawal: minimum is % sen, requested % sen',
      v_min_amount_sen, v_amount_sen;
  END IF;

  SELECT id, earnings_sen INTO v_wallet_id, v_earnings
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  IF v_earnings < v_amount_sen THEN
    RAISE EXCEPTION 'insufficient_earnings: have % sen, need % sen', v_earnings, v_amount_sen;
  END IF;

  v_dual := v_amount_sen >= 50000;  -- RM 500

  -- pending_withdrawal_exists is raised if uniq_pending_withdrawal_per_user is violated
  BEGIN
    INSERT INTO withdrawal_requests
      (user_id, wallet_id, amount, destination_label, status, requires_dual_approval)
    VALUES
      (p_user_id, v_wallet_id, p_amount_rm, 'Stripe bank on file', 'pending', v_dual)
    RETURNING id INTO v_request_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'pending_withdrawal_exists';
  END;

  UPDATE wallets
     SET earnings_sen = earnings_sen - v_amount_sen, updated_at = now()
   WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES
    (p_user_id, v_wallet_id, 'withdrawal_reserve', v_amount_sen, 'earnings', 'debit',
     v_request_id, 'Withdrawal debited — pending admin approval');

  RETURN jsonb_build_object('request_id', v_request_id, 'requires_dual_approval', v_dual);
END;
$$;

GRANT EXECUTE ON FUNCTION debit_withdrawal(UUID, NUMERIC) TO authenticated;


-- ── 4. record_admin_approval — self-dealing guard ────────────────────────────
CREATE OR REPLACE FUNCTION record_admin_approval(
  p_withdrawal_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_row   RECORD;
  v_count INT;
  v_ready BOOLEAN;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin_required'; END IF;

  SELECT id, user_id, amount, status, requires_dual_approval
    INTO v_row FROM withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'invalid_status: %', v_row.status; END IF;

  -- Self-dealing: admin cannot approve a withdrawal they submitted
  IF auth.uid() = v_row.user_id THEN
    RAISE EXCEPTION 'self_dealing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM withdrawal_approvals
     WHERE request_id = p_withdrawal_id AND approver_id = auth.uid() AND action = 'approve'
  ) THEN
    RAISE EXCEPTION 'already_approved_by_this_admin';
  END IF;

  INSERT INTO withdrawal_approvals (request_id, approver_id, action)
  VALUES (p_withdrawal_id, auth.uid(), 'approve');

  SELECT COUNT(*) INTO v_count
    FROM withdrawal_approvals WHERE request_id = p_withdrawal_id AND action = 'approve';

  v_ready := NOT v_row.requires_dual_approval OR v_count >= 2;

  IF v_ready THEN
    UPDATE withdrawal_requests
       SET status = 'approved', updated_at = now()
     WHERE id = p_withdrawal_id;
  END IF;

  RETURN jsonb_build_object(
    'ready',          v_ready,
    'user_id',        v_row.user_id,
    'amount_rm',      v_row.amount,
    'approval_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_admin_approval(UUID) TO authenticated;


-- ── 5. admin_reject_withdrawal — self-dealing guard + atomic status ───────────
CREATE OR REPLACE FUNCTION admin_reject_withdrawal(
  p_withdrawal_id UUID,
  p_note          TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin_required'; END IF;

  -- Atomic status transition: only accepts pending or approved rows
  UPDATE withdrawal_requests
     SET status = 'rejected', updated_at = now()
   WHERE id     = p_withdrawal_id
     AND status IN ('pending', 'approved')
  RETURNING user_id INTO v_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found_or_wrong_status'; END IF;

  -- Self-dealing: admin cannot reject a withdrawal they submitted
  IF auth.uid() = v_user_id THEN
    -- Rollback the status change by raising — transaction will revert
    RAISE EXCEPTION 'self_dealing';
  END IF;

  INSERT INTO withdrawal_approvals (request_id, approver_id, action, note)
  VALUES (p_withdrawal_id, auth.uid(), 'reject', p_note);

  PERFORM cancel_withdrawal(
    v_user_id, p_withdrawal_id,
    COALESCE(p_note, 'Rejected by admin — funds restored')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reject_withdrawal(UUID, TEXT) TO authenticated;


-- ── 6. admin_review_kyc — self-dealing guard ──────────────────────────────────
CREATE OR REPLACE FUNCTION admin_review_kyc(
  p_user_id UUID,
  p_action  TEXT,
  p_reason  TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_tier TEXT;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Self-dealing: admin cannot review their own KYC
  IF auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'self_dealing';
  END IF;

  v_new_tier := CASE p_action
    WHEN 'approve' THEN 'kyc_verified'
    WHEN 'reject'  THEN 'profile_complete'
    ELSE NULL
  END;
  IF v_new_tier IS NULL THEN
    RAISE EXCEPTION 'invalid_action: %', p_action;
  END IF;

  UPDATE kyc_submissions
     SET status      = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
         reviewed_at = now(),
         reviewer_id = auth.uid()
   WHERE user_id = p_user_id
     AND status  = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'kyc_not_pending_or_not_found';
  END IF;

  UPDATE users
     SET kyc_status = v_new_tier
   WHERE id          = p_user_id
     AND kyc_status  = 'kyc_submitted';

  IF p_action = 'approve' THEN
    PERFORM gen_affiliate_code(p_user_id);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_review_kyc(UUID, TEXT, TEXT) TO authenticated;


-- ── 7. admin_review_recommendation — self-dealing guard ───────────────────────
CREATE OR REPLACE FUNCTION admin_review_recommendation(
  p_rec_id  UUID,
  p_action  TEXT,
  p_reason  TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_recommender_id UUID;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid_action: %', p_action;
  END IF;

  -- Fetch recommender before update to check self-dealing
  SELECT recommender_id INTO v_recommender_id
    FROM vendor_recommendations WHERE id = p_rec_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found_or_already_reviewed: %', p_rec_id;
  END IF;

  -- Self-dealing: admin cannot review a recommendation they submitted
  IF auth.uid() = v_recommender_id THEN
    RAISE EXCEPTION 'self_dealing';
  END IF;

  UPDATE vendor_recommendations
     SET status           = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
         reviewer_id      = auth.uid(),
         reviewed_at      = now(),
         rejection_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE NULL END
   WHERE id     = p_rec_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found_or_already_reviewed: %', p_rec_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_review_recommendation(UUID, TEXT, TEXT) TO authenticated;


-- ── 8. admin_link_vendor_recommendation — self-dealing + active window guard ──
CREATE OR REPLACE FUNCTION admin_link_vendor_recommendation(
  p_vendor_id UUID,
  p_rec_id    UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_window_days     INT  := 90;
  v_conversion_id   UUID;
  v_recommender_id  UUID;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Fetch recommender to check self-dealing
  SELECT recommender_id INTO v_recommender_id
    FROM vendor_recommendations WHERE id = p_rec_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation_not_approved_or_not_found: %', p_rec_id;
  END IF;

  -- Self-dealing: admin cannot link a recommendation they submitted
  IF auth.uid() = v_recommender_id THEN
    RAISE EXCEPTION 'self_dealing';
  END IF;

  -- Per-vendor advisory lock: serialises concurrent link attempts for the same vendor
  PERFORM pg_advisory_xact_lock(hashtext('vendor_link:' || p_vendor_id::TEXT));

  -- One active conversion window per vendor at a time
  IF EXISTS (
    SELECT 1 FROM recommendation_conversions
     WHERE converted_vendor_id = p_vendor_id
       AND attribution_ends_at > now()
  ) THEN
    RAISE EXCEPTION 'vendor_already_linked';
  END IF;

  -- Read configurable attribution window (falls back to 90 days)
  SELECT COALESCE(value::INT, 90) INTO v_window_days
    FROM platform_settings
   WHERE key = 'recommendation.attribution_window_days';

  -- Advance recommendation status → 'converted'
  UPDATE vendor_recommendations
     SET status              = 'converted',
         converted_vendor_id = p_vendor_id,
         reviewed_at         = now(),
         reviewer_id         = auth.uid()
   WHERE id     = p_rec_id
     AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation_not_approved_or_not_found: %', p_rec_id;
  END IF;

  -- Create conversion record with attribution window
  INSERT INTO recommendation_conversions
    (recommendation_id, converted_vendor_id, attribution_ends_at)
  VALUES
    (p_rec_id, p_vendor_id,
     now() + (v_window_days || ' days')::INTERVAL)
  RETURNING id INTO v_conversion_id;

  RETURN v_conversion_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_link_vendor_recommendation(UUID, UUID) TO authenticated;
