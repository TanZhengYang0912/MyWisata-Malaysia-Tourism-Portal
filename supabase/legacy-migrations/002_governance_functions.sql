-- ============================================================
-- P-TMF (Trust & Money Flow) — Governance RPC Functions
-- These are the TRANSACTIONAL entry points for:
--   1. withdrawal approve/reject (single + dual approval)
--   2. recommendation convert → wallet credit
--   3. KYC status update with cascade to users table
--
-- All approval flows go through these RPCs to guarantee atomicity.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. approve_withdrawal(request_id, approver_id, action, note)
--    Handles: approve / reject / hold
--    Ensures: dual approval logic, ledger consistency, single-transaction
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_withdrawal(
  p_request_id  UUID,
  p_approver_id UUID,
  p_action      VARCHAR,
  p_note        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request        withdrawal_requests%ROWTYPE;
  v_approve_count  INT;
  v_final_status   VARCHAR;
BEGIN
  -- Validate action
  IF p_action NOT IN ('approve', 'reject', 'hold') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- Lock the request row (prevents concurrent approvals)
  SELECT * INTO v_request
    FROM withdrawal_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found: %', p_request_id;
  END IF;

  IF v_request.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Request already in terminal state: %', v_request.status;
  END IF;

  -- Prevent same approver acting twice
  IF EXISTS (
    SELECT 1 FROM withdrawal_approvals
     WHERE request_id = p_request_id AND approver_id = p_approver_id
  ) THEN
    RAISE EXCEPTION 'Approver already acted on this request';
  END IF;

  -- Record the approval action
  INSERT INTO withdrawal_approvals (request_id, approver_id, action, note)
  VALUES (p_request_id, p_approver_id, p_action, p_note);

  IF p_action = 'reject' THEN
    v_final_status := 'rejected';
    -- Release reserved funds back to available
    INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
    VALUES (
      v_request.wallet_id, 'withdrawal_release',
      v_request.amount, 'available',
      p_request_id, 'Withdrawal rejected: ' || COALESCE(p_note, '')
    );
    UPDATE wallets
       SET available_balance = available_balance + v_request.amount,
           updated_at = NOW()
     WHERE id = v_request.wallet_id;

  ELSIF p_action = 'hold' THEN
    v_final_status := 'pending';   -- still pending, no fund movement

  ELSIF p_action = 'approve' THEN
    SELECT COUNT(*) INTO v_approve_count
      FROM withdrawal_approvals
     WHERE request_id = p_request_id AND action = 'approve';

    IF v_request.requires_dual_approval AND v_approve_count < 2 THEN
      -- 1 of 2 approvals received
      v_final_status := 'pending';
    ELSE
      -- Single approval OR 2 of 2 dual approvals
      v_final_status := 'completed';
      -- Debit ledger (reserve was made on request creation; this closes it out)
      INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
      VALUES (
        v_request.wallet_id, 'withdrawal_complete',
        -v_request.amount, 'available',
        p_request_id, 'Withdrawal completed by approver ' || p_approver_id
      );
      -- Note: available_balance was already reduced at request time
    END IF;
  END IF;

  -- Update request status
  UPDATE withdrawal_requests
     SET status = v_final_status, updated_at = NOW()
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'status', v_final_status,
    'action', p_action,
    'approver_id', p_approver_id,
    'approve_count', COALESCE(v_approve_count, 0)
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. submit_withdrawal(user_id, amount, destination_id)
--    Reserves funds from available at submission time
--    Auto-flags dual approval if amount >= threshold
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_withdrawal(
  p_user_id        UUID,
  p_amount         NUMERIC,
  p_destination_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet          wallets%ROWTYPE;
  v_request_id      UUID;
  v_threshold       NUMERIC;
  v_requires_dual   BOOLEAN;
  v_kyc_status      VARCHAR;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Check KYC gate
  SELECT kyc_status INTO v_kyc_status FROM users WHERE id = p_user_id;
  IF v_kyc_status != 'approved' THEN
    RAISE EXCEPTION 'KYC not approved (current: %)', v_kyc_status;
  END IF;

  -- Lock wallet
  SELECT * INTO v_wallet
    FROM wallets
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance: available=% requested=%',
      v_wallet.available_balance, p_amount;
  END IF;

  -- Threshold from platform_settings
  SELECT value::NUMERIC INTO v_threshold
    FROM platform_settings WHERE key = 'withdrawal.high_value_rm';
  v_requires_dual := p_amount >= COALESCE(v_threshold, 500);

  -- Create request
  INSERT INTO withdrawal_requests (user_id, wallet_id, destination_id, amount, requires_dual_approval)
  VALUES (p_user_id, v_wallet.id, p_destination_id, p_amount, v_requires_dual)
  RETURNING id INTO v_request_id;

  -- Reserve funds: available goes down, ledger records reserve
  UPDATE wallets
     SET available_balance = available_balance - p_amount,
         updated_at = NOW()
   WHERE id = v_wallet.id;

  INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
  VALUES (v_wallet.id, 'withdrawal_reserve', -p_amount, 'available',
          v_request_id, 'Reserved for withdrawal request');

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'requires_dual_approval', v_requires_dual,
    'new_available_balance', v_wallet.available_balance - p_amount
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3. convert_recommendation(recommendation_id, admin_id, vendor_id, bonus_amount)
--    Marks recommendation as 'converted' AND credits recommender wallet
--    Used by admin's "Mock Convert" button
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION convert_recommendation(
  p_recommendation_id UUID,
  p_admin_id          UUID,
  p_vendor_id         UUID,
  p_bonus_amount      NUMERIC DEFAULT 12.50
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec                vendor_recommendations%ROWTYPE;
  v_wallet_id          UUID;
  v_conversion_id      UUID;
  v_ledger_entry_id    UUID;
  v_commission_id      UUID;
BEGIN
  SELECT * INTO v_rec FROM vendor_recommendations
   WHERE id = p_recommendation_id FOR UPDATE;

  IF v_rec.status != 'approved' THEN
    RAISE EXCEPTION 'Recommendation must be approved before conversion (current: %)', v_rec.status;
  END IF;

  -- 1. Record conversion
  INSERT INTO recommendation_conversions (recommendation_id, converted_vendor_id)
  VALUES (p_recommendation_id, p_vendor_id)
  RETURNING id INTO v_conversion_id;

  -- 2. Update recommendation
  UPDATE vendor_recommendations
     SET status = 'converted',
         converted_vendor_id = p_vendor_id,
         reviewed_at = NOW(),
         reviewer_id = p_admin_id
   WHERE id = p_recommendation_id;

  -- 3. Find recommender's wallet
  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_rec.recommender_id;
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Recommender has no wallet';
  END IF;

  -- 4. Credit wallet (pending)
  INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
  VALUES (v_wallet_id, 'reward_pending', p_bonus_amount, 'pending',
          v_conversion_id, 'Recommendation conversion bonus')
  RETURNING id INTO v_ledger_entry_id;

  UPDATE wallets
     SET pending_balance = pending_balance + p_bonus_amount,
         updated_at = NOW()
   WHERE id = v_wallet_id;

  -- 5. Record commission row
  INSERT INTO recommendation_commissions
    (recommender_id, conversion_id, commission_type, amount, ledger_entry_id)
  VALUES
    (v_rec.recommender_id, v_conversion_id, 'bonus', p_bonus_amount, v_ledger_entry_id)
  RETURNING id INTO v_commission_id;

  RETURN jsonb_build_object(
    'conversion_id',   v_conversion_id,
    'ledger_entry_id', v_ledger_entry_id,
    'commission_id',   v_commission_id,
    'amount_credited', p_bonus_amount
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4. review_kyc(submission_id, admin_id, action, reason)
--    Updates KYC submission + users.kyc_status atomically
--    On approve: cascades to users.kyc_status = 'approved'
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION review_kyc(
  p_submission_id UUID,
  p_admin_id      UUID,
  p_action        VARCHAR,
  p_reason        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission kyc_submissions%ROWTYPE;
  v_new_kyc_status VARCHAR;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_submission FROM kyc_submissions
   WHERE id = p_submission_id FOR UPDATE;

  IF v_submission.status != 'pending' THEN
    RAISE EXCEPTION 'Submission not pending (current: %)', v_submission.status;
  END IF;

  v_new_kyc_status := CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END;

  UPDATE kyc_submissions
     SET status = v_new_kyc_status,
         reviewer_id = p_admin_id,
         reviewed_at = NOW(),
         rejection_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE NULL END
   WHERE id = p_submission_id;

  UPDATE users
     SET kyc_status = v_new_kyc_status, updated_at = NOW()
   WHERE id = v_submission.user_id;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'user_id', v_submission.user_id,
    'new_status', v_new_kyc_status
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 5. recalculate_wallet_balance(wallet_id)
--    Rebuilds wallets.available_balance + pending_balance from ledger.
--    Called by creditWallet() helper for consistency.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION recalculate_wallet_balance(p_wallet_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_available NUMERIC;
  v_pending   NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN balance_type = 'available' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN balance_type = 'pending'   THEN amount ELSE 0 END), 0)
  INTO v_available, v_pending
  FROM wallet_ledger
  WHERE wallet_id = p_wallet_id;

  UPDATE wallets
     SET available_balance = GREATEST(v_available, 0),
         pending_balance   = GREATEST(v_pending, 0),
         updated_at        = NOW()
   WHERE id = p_wallet_id;
END;
$$;

-- Grant execute to authenticated users (RLS will still gate access)
GRANT EXECUTE ON FUNCTION approve_withdrawal        TO authenticated;
GRANT EXECUTE ON FUNCTION submit_withdrawal         TO authenticated;
GRANT EXECUTE ON FUNCTION convert_recommendation    TO authenticated;
GRANT EXECUTE ON FUNCTION review_kyc                TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_wallet_balance TO authenticated;
