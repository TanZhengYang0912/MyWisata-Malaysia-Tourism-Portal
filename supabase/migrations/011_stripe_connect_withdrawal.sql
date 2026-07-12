-- ============================================================
-- 011_stripe_connect_withdrawal.sql — Phase 2: Stripe Connect
--
-- Adds:
--   · stripe_transfer_id / stripe_payout_id on withdrawal_requests
--   · 'failed' status value
--   · RPCs: record_admin_approval, admin_set_processing,
--            admin_reject_withdrawal,
--            connect_payout_completed, connect_payout_failed
-- ============================================================


-- ── 1. Stripe Connect columns on withdrawal_requests ─────────────────────────
ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payout_id   TEXT;


-- ── 2. Extend status check to include 'failed' ───────────────────────────────
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
    CHECK (status IN ('pending','approved','rejected','processing','completed','failed'));


-- ── 3. record_admin_approval ─────────────────────────────────────────────────
-- Inserts a withdrawal_approvals row for the calling admin.
-- Returns { ready: bool, user_id, amount_rm, approval_count }.
-- ready=true means Stripe Transfer+Payout should be created by the API route.
-- Status intentionally stays 'pending' here; admin_set_processing moves it to 'processing'.
CREATE OR REPLACE FUNCTION record_admin_approval(
  p_withdrawal_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_row   RECORD;
  v_count INT;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT id, user_id, amount, status, requires_dual_approval
    INTO v_row
    FROM withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal_not_found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_status: %', v_row.status;
  END IF;
  IF EXISTS (
    SELECT 1 FROM withdrawal_approvals
     WHERE request_id = p_withdrawal_id
       AND approver_id = auth.uid()
       AND action = 'approve'
  ) THEN
    RAISE EXCEPTION 'already_approved_by_this_admin';
  END IF;

  INSERT INTO withdrawal_approvals (request_id, approver_id, action)
  VALUES (p_withdrawal_id, auth.uid(), 'approve');

  SELECT COUNT(*) INTO v_count
    FROM withdrawal_approvals
   WHERE request_id = p_withdrawal_id AND action = 'approve';

  RETURN jsonb_build_object(
    'ready',          (NOT v_row.requires_dual_approval OR v_count >= 2),
    'user_id',        v_row.user_id,
    'amount_rm',      v_row.amount,
    'approval_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_admin_approval(UUID) TO authenticated;


-- ── 4. admin_set_processing ───────────────────────────────────────────────────
-- Called by the API route after Stripe Transfer + Payout are created.
-- Returns TRUE if updated, FALSE if already in a terminal/processing state (idempotent).
CREATE OR REPLACE FUNCTION admin_set_processing(
  p_withdrawal_id UUID,
  p_transfer_id   TEXT,
  p_payout_id     TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  UPDATE withdrawal_requests
     SET status             = 'processing',
         stripe_transfer_id = p_transfer_id,
         stripe_payout_id   = p_payout_id,
         updated_at         = now()
   WHERE id = p_withdrawal_id AND status = 'pending';

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_processing(UUID, TEXT, TEXT) TO authenticated;


-- ── 5. admin_reject_withdrawal ────────────────────────────────────────────────
-- Records admin rejection, restores earnings via cancel_withdrawal, sets status='rejected'.
CREATE OR REPLACE FUNCTION admin_reject_withdrawal(
  p_withdrawal_id UUID,
  p_note          TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT user_id INTO v_user_id
    FROM withdrawal_requests
   WHERE id = p_withdrawal_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found_or_wrong_status';
  END IF;

  INSERT INTO withdrawal_approvals (request_id, approver_id, action, note)
  VALUES (p_withdrawal_id, auth.uid(), 'reject', p_note);

  PERFORM cancel_withdrawal(
    v_user_id,
    p_withdrawal_id,
    COALESCE(p_note, 'Rejected by admin — funds restored')
  );

  UPDATE withdrawal_requests
     SET status = 'rejected', updated_at = now()
   WHERE id = p_withdrawal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reject_withdrawal(UUID, TEXT) TO authenticated;


-- ── 6. connect_payout_completed ───────────────────────────────────────────────
-- Called from Connect webhook on payout.paid.
-- Idempotent: no-op if payout_id not found or already completed.
CREATE OR REPLACE FUNCTION connect_payout_completed(
  p_payout_id TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id       UUID;
  v_withdrawal_id UUID;
BEGIN
  SELECT id, user_id INTO v_withdrawal_id, v_user_id
    FROM withdrawal_requests
   WHERE stripe_payout_id = p_payout_id
     AND status = 'processing';

  IF NOT FOUND THEN RETURN; END IF;

  PERFORM complete_withdrawal(v_user_id, v_withdrawal_id, p_payout_id);

  UPDATE withdrawal_requests
     SET status = 'completed', updated_at = now()
   WHERE id = v_withdrawal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION connect_payout_completed(TEXT) TO anon;


-- ── 7. connect_payout_failed ──────────────────────────────────────────────────
-- Called from Connect webhook on payout.failed.
-- Restores earnings_sen via cancel_withdrawal, sets status='failed'.
CREATE OR REPLACE FUNCTION connect_payout_failed(
  p_payout_id TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id       UUID;
  v_withdrawal_id UUID;
BEGIN
  SELECT id, user_id INTO v_withdrawal_id, v_user_id
    FROM withdrawal_requests
   WHERE stripe_payout_id = p_payout_id
     AND status = 'processing';

  IF NOT FOUND THEN RETURN; END IF;

  PERFORM cancel_withdrawal(
    v_user_id,
    v_withdrawal_id,
    'Stripe payout failed — earnings restored'
  );

  UPDATE withdrawal_requests
     SET status = 'failed', updated_at = now()
   WHERE id = v_withdrawal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION connect_payout_failed(TEXT) TO anon;
