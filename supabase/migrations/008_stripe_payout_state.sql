-- ============================================================
-- Migration 008 — Two-phase withdrawal with Stripe payout gateway
--
-- Before: approve_withdrawal(action='approve') → status='completed' + ledger debited
-- After:  approve_withdrawal(action='approve') → status='approved' (funds still reserved)
--         Then: initiatePayout() at Stripe → status='processing'
--                Stripe webhook 'transfer.paid'   → complete_payout()   → 'completed' + debit
--                Stripe webhook 'transfer.failed' → fail_payout()       → 'rejected'  + release
--
-- This makes withdrawal_requests.status the CUSTOMER-facing state, while
-- payout_transactions tracks the external gateway lifecycle separately.
-- ============================================================


-- Add stripe_account_id to payout_destinations for real Connect onboarding (P1).
-- Demo just uses STRIPE_DEMO_CONNECT_ACCOUNT for all users.
ALTER TABLE payout_destinations
  ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(100);

-- Ensure payout_transactions has room for Stripe response metadata
ALTER TABLE payout_transactions
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Rewrite approve_withdrawal so single/final approval ends at 'approved' (not 'completed').
-- Ledger debit happens LATER when the Stripe transfer confirms via webhook.
CREATE OR REPLACE FUNCTION approve_withdrawal(
  p_request_id  UUID,
  p_approver_id UUID,
  p_action      VARCHAR,
  p_note        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request        withdrawal_requests%ROWTYPE;
  v_approve_count  INT;
  v_final_status   VARCHAR;
BEGIN
  IF p_approver_id != auth.uid() THEN
    RAISE EXCEPTION 'Approver ID mismatch — cannot act on behalf of another user';
  END IF;
  IF NOT is_approver(p_approver_id) THEN
    RAISE EXCEPTION 'Caller is not an approver';
  END IF;
  IF p_action NOT IN ('approve', 'reject', 'hold') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_request FROM withdrawal_requests
   WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found: %', p_request_id;
  END IF;
  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request already in terminal state: %', v_request.status;
  END IF;
  IF v_request.user_id = p_approver_id THEN
    RAISE EXCEPTION 'Approver cannot act on their own withdrawal request';
  END IF;
  IF EXISTS (
    SELECT 1 FROM withdrawal_approvals
     WHERE request_id = p_request_id AND approver_id = p_approver_id
  ) THEN
    RAISE EXCEPTION 'Approver already acted on this request';
  END IF;

  INSERT INTO withdrawal_approvals (request_id, approver_id, action, note)
  VALUES (p_request_id, p_approver_id, p_action, p_note);

  IF p_action = 'reject' THEN
    v_final_status := 'rejected';
    -- Release reserved funds back to available
    INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
    VALUES (v_request.wallet_id, 'withdrawal_release', v_request.amount, 'available',
            p_request_id, 'Withdrawal rejected: ' || COALESCE(p_note, ''));
    UPDATE wallets
       SET available_balance = available_balance + v_request.amount, updated_at = NOW()
     WHERE id = v_request.wallet_id;

  ELSIF p_action = 'hold' THEN
    v_final_status := 'pending';   -- stay pending

  ELSIF p_action = 'approve' THEN
    SELECT COUNT(*) INTO v_approve_count FROM withdrawal_approvals
     WHERE request_id = p_request_id AND action = 'approve';

    IF v_request.requires_dual_approval AND v_approve_count < 2 THEN
      v_final_status := 'pending';   -- 1 of 2 received
    ELSE
      -- CHANGED: end at 'approved' — payout gateway completes the flow via webhook.
      -- No ledger debit yet; funds remain reserved.
      v_final_status := 'approved';
    END IF;
  END IF;

  UPDATE withdrawal_requests SET status = v_final_status, updated_at = NOW()
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'status',        v_final_status,
    'action',        p_action,
    'approve_count', COALESCE(v_approve_count, 0)
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- record_payout_pending — called after Stripe transfer.create returns
-- Inserts payout_transactions row + moves withdrawal_requests → 'processing'
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_payout_pending(
  p_request_id  UUID,
  p_gateway     VARCHAR,
  p_gateway_ref VARCHAR,
  p_metadata    JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request withdrawal_requests%ROWTYPE;
  v_payout_id UUID;
BEGIN
  IF NOT is_approver(auth.uid()) THEN
    RAISE EXCEPTION 'Only approvers can trigger payouts';
  END IF;

  SELECT * INTO v_request FROM withdrawal_requests
   WHERE id = p_request_id FOR UPDATE;
  IF v_request.status != 'approved' THEN
    RAISE EXCEPTION 'Withdrawal must be approved to initiate payout (current: %)', v_request.status;
  END IF;

  INSERT INTO payout_transactions (request_id, gateway, gateway_ref, status, metadata)
  VALUES (p_request_id, p_gateway, p_gateway_ref, 'pending', p_metadata)
  RETURNING id INTO v_payout_id;

  UPDATE withdrawal_requests SET status = 'processing', updated_at = NOW()
   WHERE id = p_request_id;

  RETURN v_payout_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- complete_payout — called by webhook when Stripe transfer succeeds
-- Debits ledger, marks request completed, updates payout_transactions
-- SECURITY: NOT restricted to admin — webhook signature validation gates it.
-- To prevent abuse, only accept if the payout_transactions.status is 'pending'.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION complete_payout(
  p_gateway_ref VARCHAR
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout    payout_transactions%ROWTYPE;
  v_request   withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_payout FROM payout_transactions
   WHERE gateway_ref = p_gateway_ref FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout transaction not found for gateway_ref: %', p_gateway_ref;
  END IF;
  IF v_payout.status = 'succeeded' THEN
    -- Idempotent: already processed
    RETURN jsonb_build_object('status', 'already_completed', 'payout_id', v_payout.id);
  END IF;
  IF v_payout.status != 'pending' THEN
    RAISE EXCEPTION 'Payout not in pending state: %', v_payout.status;
  END IF;

  SELECT * INTO v_request FROM withdrawal_requests
   WHERE id = v_payout.request_id FOR UPDATE;

  IF v_request.status NOT IN ('processing', 'approved') THEN
    RAISE EXCEPTION 'Withdrawal in unexpected state: %', v_request.status;
  END IF;

  -- Debit wallet ledger (funds were reserved earlier at submit time)
  INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
  VALUES (v_request.wallet_id, 'withdrawal_complete', -v_request.amount, 'available',
          v_request.id, 'Stripe payout confirmed: ' || p_gateway_ref);

  UPDATE withdrawal_requests SET status = 'completed', updated_at = NOW()
   WHERE id = v_request.id;

  UPDATE payout_transactions SET status = 'succeeded'
   WHERE id = v_payout.id;

  RETURN jsonb_build_object(
    'status',     'completed',
    'payout_id',  v_payout.id,
    'request_id', v_request.id
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- fail_payout — called by webhook on transfer.failed
-- Releases reserved funds, marks request rejected
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fail_payout(
  p_gateway_ref VARCHAR,
  p_reason      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout  payout_transactions%ROWTYPE;
  v_request withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_payout FROM payout_transactions
   WHERE gateway_ref = p_gateway_ref FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout transaction not found for gateway_ref: %', p_gateway_ref;
  END IF;
  IF v_payout.status IN ('failed', 'succeeded') THEN
    RETURN jsonb_build_object('status', 'already_final', 'payout_id', v_payout.id);
  END IF;

  SELECT * INTO v_request FROM withdrawal_requests
   WHERE id = v_payout.request_id FOR UPDATE;

  -- Release reserved funds back to available
  INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
  VALUES (v_request.wallet_id, 'withdrawal_release', v_request.amount, 'available',
          v_request.id, 'Stripe payout failed: ' || COALESCE(p_reason, 'unknown'));
  UPDATE wallets
     SET available_balance = available_balance + v_request.amount, updated_at = NOW()
   WHERE id = v_request.wallet_id;

  UPDATE withdrawal_requests SET status = 'rejected', notes = COALESCE(p_reason, notes),
                                 updated_at = NOW()
   WHERE id = v_request.id;

  UPDATE payout_transactions
     SET status = 'failed', failure_reason = p_reason
   WHERE id = v_payout.id;

  RETURN jsonb_build_object(
    'status',     'reverted',
    'payout_id',  v_payout.id,
    'request_id', v_request.id
  );
END;
$$;


-- Grants
GRANT EXECUTE ON FUNCTION record_payout_pending TO authenticated;
GRANT EXECUTE ON FUNCTION complete_payout       TO service_role;
GRANT EXECUTE ON FUNCTION fail_payout           TO service_role;

-- RLS for payout_transactions — customer sees their own, admins see all, webhook uses service_role
ALTER TABLE payout_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_txns_read ON payout_transactions;
CREATE POLICY payout_txns_read ON payout_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM withdrawal_requests wr
              WHERE wr.id = payout_transactions.request_id
                AND (wr.user_id = auth.uid() OR is_admin(auth.uid())))
  );
