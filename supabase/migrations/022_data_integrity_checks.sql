-- ============================================================
-- 022_data_integrity_checks.sql — PR 022: P2 Data Integrity
--
-- Cross-column CHECK constraints to reject impossible states:
--   1. booking_slots.ends_at > starts_at
--   2. recommendation_commissions.amount > 0
--   3. recommendation_conversions.attribution_ends_at > converted_at (when set)
--   4. wallet_transactions: bucket ↔ type semantic consistency
--   5. withdrawal_requests: Stripe IDs must be present in terminal states
--
-- Reconciliation RPC:
--   6. check_data_integrity() — admin-only; returns wallet ledger
--      imbalances, processing withdrawals without Stripe IDs,
--      and pending commissions on expired attribution windows.
--
-- Note on wallet_transactions.withdrawal_complete:
--   This type is an informational settlement record — the actual
--   earnings_sen deduction happens at withdrawal_reserve time.
--   Ledger reconciliation therefore EXCLUDES withdrawal_complete
--   from the debit side.
-- ============================================================


-- ── 0. Pre-flight: abort if any existing row would violate a new CHECK ─────────
DO $$
BEGIN
  -- booking_slots: ends_at must be after starts_at
  IF EXISTS (SELECT 1 FROM booking_slots WHERE ends_at <= starts_at) THEN
    RAISE EXCEPTION
      'Migration 022 blocked: booking_slots rows exist where ends_at <= starts_at.';
  END IF;

  -- recommendation_commissions: amount must be positive
  IF EXISTS (SELECT 1 FROM recommendation_commissions WHERE amount <= 0) THEN
    RAISE EXCEPTION
      'Migration 022 blocked: recommendation_commissions rows exist with amount <= 0.';
  END IF;

  -- recommendation_conversions: window must end after it starts (when set)
  IF EXISTS (
    SELECT 1 FROM recommendation_conversions
    WHERE attribution_ends_at IS NOT NULL
      AND attribution_ends_at <= converted_at
  ) THEN
    RAISE EXCEPTION
      'Migration 022 blocked: recommendation_conversions rows exist where attribution_ends_at <= converted_at.';
  END IF;

  -- wallet_transactions: bucket↔type consistency
  IF EXISTS (
    SELECT 1 FROM wallet_transactions
    WHERE NOT (
      (type = 'topup'               AND bucket = 'topup')                           OR
      (type = 'spend'               AND bucket IN ('topup', 'earnings'))             OR
      (type = 'earnings'            AND bucket = 'earnings')                         OR
      (type = 'withdrawal_reserve'  AND bucket = 'earnings')                         OR
      (type = 'withdrawal_cancel'   AND bucket = 'earnings')                         OR
      (type = 'withdrawal_complete' AND bucket = 'earnings')                         OR
      (type = 'earnings_pending'    AND bucket = 'pending_earnings')                 OR
      (type = 'earnings_confirm'    AND bucket IN ('earnings', 'pending_earnings'))  OR
      (type = 'earnings_reverse'    AND bucket = 'pending_earnings')
    )
  ) THEN
    RAISE EXCEPTION
      'Migration 022 blocked: wallet_transactions rows exist with inconsistent bucket/type combinations.';
  END IF;

  -- withdrawal_requests: terminal states require Stripe IDs
  IF EXISTS (
    SELECT 1 FROM withdrawal_requests
    WHERE status IN ('processing', 'paid', 'completed')
      AND (stripe_transfer_id IS NULL OR stripe_payout_id IS NULL)
  ) THEN
    RAISE EXCEPTION
      'Migration 022 blocked: withdrawal_requests in terminal status missing stripe_transfer_id or stripe_payout_id. '
      'Run admin approve or manually backfill Stripe IDs before re-running.';
  END IF;
END $$;


-- ── 1. booking_slots: temporal sanity ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'booking_slots'::regclass
       AND conname  = 'booking_slot_ends_after_starts'
  ) THEN
    ALTER TABLE booking_slots
      ADD CONSTRAINT booking_slot_ends_after_starts
        CHECK (ends_at > starts_at);
  END IF;
END $$;


-- ── 2. recommendation_commissions: positive amount ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'recommendation_commissions'::regclass
       AND conname  = 'rec_commission_amount_positive'
  ) THEN
    ALTER TABLE recommendation_commissions
      ADD CONSTRAINT rec_commission_amount_positive
        CHECK (amount > 0);
  END IF;
END $$;


-- ── 3. recommendation_conversions: positive attribution window ────────────────
-- Only enforced when attribution_ends_at is explicitly set (NULL = window not yet opened).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'recommendation_conversions'::regclass
       AND conname  = 'rec_conversion_window_positive'
  ) THEN
    ALTER TABLE recommendation_conversions
      ADD CONSTRAINT rec_conversion_window_positive
        CHECK (attribution_ends_at IS NULL OR attribution_ends_at > converted_at);
  END IF;
END $$;


-- ── 4. wallet_transactions: bucket ↔ type semantic consistency ─────────────────
-- Prevents the wrong bucket being used for a given transaction type,
-- which would cause the ledger sum to silently diverge from wallet balances.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'wallet_transactions'::regclass
       AND conname  = 'wt_bucket_type_consistent'
  ) THEN
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT wt_bucket_type_consistent
        CHECK (
          (type = 'topup'               AND bucket = 'topup')                           OR
          (type = 'spend'               AND bucket IN ('topup', 'earnings'))             OR
          (type = 'earnings'            AND bucket = 'earnings')                         OR
          (type = 'withdrawal_reserve'  AND bucket = 'earnings')                         OR
          (type = 'withdrawal_cancel'   AND bucket = 'earnings')                         OR
          (type = 'withdrawal_complete' AND bucket = 'earnings')                         OR
          (type = 'earnings_pending'    AND bucket = 'pending_earnings')                 OR
          (type = 'earnings_confirm'    AND bucket IN ('earnings', 'pending_earnings'))  OR
          (type = 'earnings_reverse'    AND bucket = 'pending_earnings')
        );
  END IF;
END $$;


-- ── 5. withdrawal_requests: Stripe IDs must be set in terminal states ──────────
-- status='approved' is the retry checkpoint (may have stripe_transfer_id from a
-- partial run but not yet stripe_payout_id) — excluded intentionally.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'withdrawal_requests'::regclass
       AND conname  = 'wr_terminal_has_stripe_ids'
  ) THEN
    ALTER TABLE withdrawal_requests
      ADD CONSTRAINT wr_terminal_has_stripe_ids
        CHECK (
          status NOT IN ('processing', 'paid', 'completed')
          OR (stripe_transfer_id IS NOT NULL AND stripe_payout_id IS NOT NULL)
        );
  END IF;
END $$;


-- ── 6. check_data_integrity() — admin reconciliation RPC ─────────────────────
-- Returns a JSONB report with:
--   · wallet_ledger_imbalances:      users where stored balance ≠ ledger sum
--   · processing_without_stripe_ids: withdrawals in terminal state missing IDs
--   · pending_commissions_expired:   commissions still pending after window closed
--
-- withdrawal_complete is intentionally excluded from earnings ledger:
-- it is a settlement log entry; the earnings_sen deduction occurred at
-- withdrawal_reserve time (see debit_withdrawal RPC).
CREATE OR REPLACE FUNCTION check_data_integrity()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_issues     JSONB;
  v_withdrawal_issues JSONB;
  v_commission_issues JSONB;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Wallet ledger vs stored balance
  SELECT jsonb_agg(row_to_json(t))
    INTO v_wallet_issues
    FROM (
      SELECT
        w.user_id,
        w.earnings_sen                                          AS stored_earnings_sen,
        COALESCE(SUM(
          CASE
            WHEN wt.bucket = 'earnings' AND wt.direction = 'credit'
              THEN wt.amount_sen
            WHEN wt.bucket = 'earnings' AND wt.direction = 'debit'
                 AND wt.type <> 'withdrawal_complete'
              THEN -wt.amount_sen
            ELSE 0
          END
        ), 0)                                                   AS ledger_earnings_sen,
        w.pending_earnings_sen                                  AS stored_pending_sen,
        COALESCE(SUM(
          CASE
            WHEN wt.bucket = 'pending_earnings' AND wt.direction = 'credit'
              THEN wt.amount_sen
            WHEN wt.bucket = 'pending_earnings' AND wt.direction = 'debit'
              THEN -wt.amount_sen
            ELSE 0
          END
        ), 0)                                                   AS ledger_pending_sen,
        w.topup_sen                                             AS stored_topup_sen,
        COALESCE(SUM(
          CASE
            WHEN wt.bucket = 'topup' AND wt.direction = 'credit'
              THEN wt.amount_sen
            WHEN wt.bucket = 'topup' AND wt.direction = 'debit'
              THEN -wt.amount_sen
            ELSE 0
          END
        ), 0)                                                   AS ledger_topup_sen
      FROM wallets w
      LEFT JOIN wallet_transactions wt ON wt.wallet_id = w.id
      GROUP BY w.user_id, w.earnings_sen, w.pending_earnings_sen, w.topup_sen
      HAVING
        w.earnings_sen         <> COALESCE(SUM(
          CASE
            WHEN wt.bucket = 'earnings' AND wt.direction = 'credit'          THEN  wt.amount_sen
            WHEN wt.bucket = 'earnings' AND wt.direction = 'debit'
                 AND wt.type <> 'withdrawal_complete'                        THEN -wt.amount_sen
            ELSE 0
          END
        ), 0)
        OR w.pending_earnings_sen <> COALESCE(SUM(
          CASE
            WHEN wt.bucket = 'pending_earnings' AND wt.direction = 'credit'  THEN  wt.amount_sen
            WHEN wt.bucket = 'pending_earnings' AND wt.direction = 'debit'   THEN -wt.amount_sen
            ELSE 0
          END
        ), 0)
        OR w.topup_sen <> COALESCE(SUM(
          CASE
            WHEN wt.bucket = 'topup' AND wt.direction = 'credit'             THEN  wt.amount_sen
            WHEN wt.bucket = 'topup' AND wt.direction = 'debit'              THEN -wt.amount_sen
            ELSE 0
          END
        ), 0)
    ) t;

  -- Processing/terminal withdrawals missing Stripe IDs
  SELECT jsonb_agg(jsonb_build_object(
    'id',               id,
    'status',           status,
    'amount',           amount,
    'stripe_transfer_id', stripe_transfer_id,
    'stripe_payout_id',   stripe_payout_id
  ))
    INTO v_withdrawal_issues
    FROM withdrawal_requests
   WHERE status IN ('processing', 'paid', 'completed')
     AND (stripe_transfer_id IS NULL OR stripe_payout_id IS NULL);

  -- Pending commissions on expired attribution windows
  SELECT jsonb_agg(jsonb_build_object(
    'commission_id',       rc.id,
    'recommender_id',      rc.recommender_id,
    'commission_type',     rc.commission_type,
    'amount',              rc.amount,
    'commission_status',   rc.status,
    'attribution_ends_at', conv.attribution_ends_at
  ))
    INTO v_commission_issues
    FROM recommendation_commissions rc
    JOIN recommendation_conversions conv ON conv.id = rc.conversion_id
   WHERE rc.status = 'pending'
     AND conv.attribution_ends_at IS NOT NULL
     AND conv.attribution_ends_at < now();

  RETURN jsonb_build_object(
    'wallet_ledger_imbalances',       COALESCE(v_wallet_issues,     '[]'::jsonb),
    'processing_without_stripe_ids',  COALESCE(v_withdrawal_issues, '[]'::jsonb),
    'pending_commissions_expired',    COALESCE(v_commission_issues, '[]'::jsonb),
    'checked_at',                     now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_data_integrity() TO authenticated;
