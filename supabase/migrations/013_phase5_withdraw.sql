-- ============================================================
-- 013_phase5_withdraw.sql — Phase 5: Withdrawal flow overhaul
--
-- Changes:
--   · Add 'paid' status
--   · record_admin_approval: sets status='approved' when ready (retry-safe)
--   · admin_set_processing:  accepts 'approved' status (retry path)
--   · admin_reject_withdrawal: accepts 'pending' OR 'approved'
--   · debit_withdrawal: replaces request_withdrawal; destination hardcoded
--   · connect_payout_completed: status='paid', proper ledger entry
--   · connect_payout_failed: credit_earnings (reverse debit)
-- ============================================================


-- ── 1. Add 'paid' to status constraint ───────────────────────────────────────
DO $$
DECLARE v_con TEXT;
BEGIN
  SELECT conname INTO v_con
    FROM pg_constraint
   WHERE conrelid = 'withdrawal_requests'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%';
  IF v_con IS NOT NULL THEN
    EXECUTE 'ALTER TABLE withdrawal_requests DROP CONSTRAINT ' || quote_ident(v_con);
  END IF;
END $$;

ALTER TABLE withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_check
    CHECK (status IN ('pending','approved','rejected','processing','completed','failed','paid'));


-- ── 2. record_admin_approval: set status='approved' when ready ───────────────
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
    -- Mark approved so Stripe can fire; status='approved' survives a Stripe failure (retry-safe)
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


-- ── 3. admin_set_processing: also accepts 'approved' (retry path) ────────────
CREATE OR REPLACE FUNCTION admin_set_processing(
  p_withdrawal_id UUID,
  p_transfer_id   TEXT,
  p_payout_id     TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin_required'; END IF;

  UPDATE withdrawal_requests
     SET status             = 'processing',
         stripe_transfer_id = p_transfer_id,
         stripe_payout_id   = p_payout_id,
         updated_at         = now()
   WHERE id = p_withdrawal_id AND status IN ('pending', 'approved');

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_processing(UUID, TEXT, TEXT) TO authenticated;


-- ── 4. admin_reject_withdrawal: also accepts 'approved' ──────────────────────
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

  SELECT user_id INTO v_user_id
    FROM withdrawal_requests
   WHERE id = p_withdrawal_id AND status IN ('pending', 'approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found_or_wrong_status'; END IF;

  INSERT INTO withdrawal_approvals (request_id, approver_id, action, note)
  VALUES (p_withdrawal_id, auth.uid(), 'reject', p_note);

  PERFORM cancel_withdrawal(
    v_user_id, p_withdrawal_id,
    COALESCE(p_note, 'Rejected by admin — funds restored')
  );

  UPDATE withdrawal_requests
     SET status = 'rejected', updated_at = now()
   WHERE id = p_withdrawal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reject_withdrawal(UUID, TEXT) TO authenticated;


-- ── 5. debit_withdrawal: like request_withdrawal, destination hardcoded ───────
CREATE OR REPLACE FUNCTION debit_withdrawal(
  p_user_id   UUID,
  p_amount_rm NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id  UUID;
  v_earnings   BIGINT;
  v_amount_sen BIGINT;
  v_request_id UUID;
  v_dual       BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized'; END IF;

  v_amount_sen := ROUND(p_amount_rm * 100)::BIGINT;
  IF v_amount_sen <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;

  SELECT id, earnings_sen INTO v_wallet_id, v_earnings
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  IF v_earnings < v_amount_sen THEN
    RAISE EXCEPTION 'insufficient_earnings: have % sen, need % sen', v_earnings, v_amount_sen;
  END IF;

  v_dual := v_amount_sen >= 50000;  -- RM 500

  INSERT INTO withdrawal_requests
    (user_id, wallet_id, amount, destination_label, status, requires_dual_approval)
  VALUES
    (p_user_id, v_wallet_id, p_amount_rm, 'Stripe bank on file', 'pending', v_dual)
  RETURNING id INTO v_request_id;

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


-- ── 6. connect_payout_completed: status='paid' + ledger entry ────────────────
CREATE OR REPLACE FUNCTION connect_payout_completed(
  p_payout_id TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id       UUID;
  v_withdrawal_id UUID;
  v_wallet_id     UUID;
  v_amount        BIGINT;
BEGIN
  SELECT id, user_id INTO v_withdrawal_id, v_user_id
    FROM withdrawal_requests WHERE stripe_payout_id = p_payout_id AND status = 'processing';
  IF NOT FOUND THEN RETURN; END IF;

  SELECT wallet_id, amount_sen INTO v_wallet_id, v_amount
    FROM wallet_transactions
   WHERE withdrawal_id = v_withdrawal_id AND type = 'withdrawal_reserve'
   LIMIT 1;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, stripe_ref, note)
  VALUES
    (v_user_id, v_wallet_id, 'withdrawal_complete', v_amount, 'earnings', 'debit',
     v_withdrawal_id, p_payout_id, 'Stripe payout confirmed');

  UPDATE withdrawal_requests
     SET status = 'paid', updated_at = now()
   WHERE id = v_withdrawal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION connect_payout_completed(TEXT) TO anon;


-- ── 7. connect_payout_failed: credit_earnings reverse + status='failed' ───────
CREATE OR REPLACE FUNCTION connect_payout_failed(
  p_payout_id TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id       UUID;
  v_withdrawal_id UUID;
  v_amount        BIGINT;
BEGIN
  SELECT id, user_id INTO v_withdrawal_id, v_user_id
    FROM withdrawal_requests WHERE stripe_payout_id = p_payout_id AND status = 'processing';
  IF NOT FOUND THEN RETURN; END IF;

  SELECT amount_sen INTO v_amount
    FROM wallet_transactions
   WHERE withdrawal_id = v_withdrawal_id AND type = 'withdrawal_reserve'
   LIMIT 1;

  -- Reverse the debit via credit_earnings so it appears as an earnings credit in the ledger
  PERFORM credit_earnings(v_user_id, v_amount, v_withdrawal_id,
                          'Stripe payout failed — earnings refunded');

  UPDATE withdrawal_requests
     SET status = 'failed', updated_at = now()
   WHERE id = v_withdrawal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION connect_payout_failed(TEXT) TO anon;
