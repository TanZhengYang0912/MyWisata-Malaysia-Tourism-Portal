-- ============================================================
-- 009_stripe_wallet.sql  — Phase 1: Stripe wallet integration
--
-- Adds:
--   · stripe_customer_id / stripe_connect_account_id on users
--   · topup_sen / earnings_sen (integer-sen dual-bucket) on wallets
--   · destination_label on withdrawal_requests (replaces broken free-text field)
--   · wallet_transactions table (idempotent ledger, stripe_event_id UNIQUE)
--   · RPCs: credit_topup, credit_earnings, reserve_for_withdrawal,
--            cancel_withdrawal, complete_withdrawal, request_withdrawal
-- ============================================================


-- ── 1. Stripe IDs on users ───────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id        TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT UNIQUE;


-- ── 2. Dual-bucket integer-sen balances on wallets ───────────────────────────
-- topup_sen    = credited from Stripe Checkout; spendable only (not withdrawable)
-- earnings_sen = credited from sales / commissions; spendable + withdrawable
ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS topup_sen    BIGINT NOT NULL DEFAULT 0 CHECK (topup_sen    >= 0),
  ADD COLUMN IF NOT EXISTS earnings_sen BIGINT NOT NULL DEFAULT 0 CHECK (earnings_sen >= 0);


-- ── 3. destination_label on withdrawal_requests ──────────────────────────────
-- Replaces the broken implicit free-text field that was never a real column.
-- destination_id FK kept for future real bank-account wiring (Phase 2+).
ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS destination_label TEXT;


-- ── 4. wallet_transactions — idempotent ledger ───────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
  wallet_id        UUID        NOT NULL REFERENCES wallets(id)          ON DELETE CASCADE,
  type             TEXT        NOT NULL CHECK (type IN (
                     'topup',               -- Stripe Checkout completed  → +topup_sen
                     'spend',               -- order payment              → -topup_sen / -earnings_sen
                     'earnings',            -- sale / commission credit   → +earnings_sen
                     'withdrawal_reserve',  -- withdrawal submitted       → -earnings_sen
                     'withdrawal_complete', -- payout.paid settled        → settlement record
                     'withdrawal_cancel'    -- rejected / failed          → +earnings_sen restored
                   )),
  amount_sen       BIGINT      NOT NULL CHECK (amount_sen > 0),
  bucket           TEXT        NOT NULL CHECK (bucket    IN ('topup', 'earnings')),
  direction        TEXT        NOT NULL CHECK (direction IN ('credit', 'debit')),
  stripe_event_id  TEXT        UNIQUE,    -- webhook idempotency key (NULL for non-Stripe rows)
  stripe_ref       TEXT,                  -- PaymentIntent / Transfer / Payout ID
  withdrawal_id    UUID        REFERENCES withdrawal_requests(id),
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_txn_user
  ON wallet_transactions (user_id, created_at DESC);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_txn_read_own_or_admin" ON wallet_transactions;
CREATE POLICY "wallet_txn_read_own_or_admin"
  ON wallet_transactions FOR SELECT
  USING (user_id = auth.uid() OR is_admin(auth.uid()));


-- ── 5. credit_topup — idempotent; called from /api/stripe/webhook ─────────────
--    Stripe fires checkout.session.completed → this RPC credits topup_sen.
--    Re-entrancy safe: duplicate stripe_event_id is a silent no-op.
CREATE OR REPLACE FUNCTION credit_topup(
  p_user_id         UUID,
  p_amount_sen      BIGINT,
  p_stripe_event_id TEXT,
  p_stripe_ref      TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM wallet_transactions WHERE stripe_event_id = p_stripe_event_id
  ) THEN RETURN; END IF;

  SELECT id INTO v_wallet_id
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found for user %', p_user_id;
  END IF;

  UPDATE wallets
     SET topup_sen  = topup_sen + p_amount_sen,
         updated_at = now()
   WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, stripe_event_id, stripe_ref, note)
  VALUES
    (p_user_id, v_wallet_id, 'topup', p_amount_sen, 'topup', 'credit',
     p_stripe_event_id, p_stripe_ref, 'Stripe Checkout top-up');
END;
$$;


-- ── 6. credit_earnings — called when vendor sale / commission is confirmed ─────
CREATE OR REPLACE FUNCTION credit_earnings(
  p_user_id    UUID,
  p_amount_sen BIGINT,
  p_ref_id     UUID DEFAULT NULL,
  p_note       TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
BEGIN
  SELECT id INTO v_wallet_id
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found for user %', p_user_id;
  END IF;

  UPDATE wallets
     SET earnings_sen = earnings_sen + p_amount_sen,
         updated_at   = now()
   WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, note)
  VALUES
    (p_user_id, v_wallet_id, 'earnings', p_amount_sen, 'earnings', 'credit',
     COALESCE(p_note, 'Earnings credit'));
END;
$$;


-- ── 7. request_withdrawal — atomic submission; called via authenticated RPC ───
--    Validates earnings_sen, reserves funds, creates withdrawal_request row.
--    Granted to authenticated so the client can call it directly.
CREATE OR REPLACE FUNCTION request_withdrawal(
  p_user_id           UUID,
  p_amount_rm         NUMERIC,
  p_destination_label TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id   UUID;
  v_earnings    BIGINT;
  v_amount_sen  BIGINT;
  v_request_id  UUID;
  v_dual        BOOLEAN;
BEGIN
  -- Caller must be the subject user
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_amount_sen := ROUND(p_amount_rm * 100)::BIGINT;
  IF v_amount_sen <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;

  SELECT id, earnings_sen INTO v_wallet_id, v_earnings
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  IF v_earnings < v_amount_sen THEN
    RAISE EXCEPTION 'insufficient_earnings: have % sen, need % sen',
      v_earnings, v_amount_sen;
  END IF;

  v_dual := v_amount_sen >= 50000;   -- RM 500 = 50 000 sen

  INSERT INTO withdrawal_requests
    (user_id, wallet_id, amount, destination_label, status, requires_dual_approval)
  VALUES
    (p_user_id, v_wallet_id, p_amount_rm, p_destination_label, 'pending', v_dual)
  RETURNING id INTO v_request_id;

  UPDATE wallets
     SET earnings_sen = earnings_sen - v_amount_sen,
         updated_at   = now()
   WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES
    (p_user_id, v_wallet_id, 'withdrawal_reserve', v_amount_sen, 'earnings', 'debit',
     v_request_id, 'Withdrawal requested — pending admin approval');

  RETURN jsonb_build_object(
    'request_id',             v_request_id,
    'requires_dual_approval', v_dual
  );
END;
$$;

GRANT EXECUTE ON FUNCTION request_withdrawal(UUID, NUMERIC, TEXT) TO authenticated;


-- ── 8. reserve_for_withdrawal — admin flow helper (Phase 2 Stripe Connect) ───
CREATE OR REPLACE FUNCTION reserve_for_withdrawal(
  p_user_id       UUID,
  p_amount_sen    BIGINT,
  p_withdrawal_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_earnings  BIGINT;
BEGIN
  SELECT id, earnings_sen INTO v_wallet_id, v_earnings
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  IF v_earnings < p_amount_sen THEN
    RAISE EXCEPTION 'insufficient_earnings: have % sen, need % sen',
      v_earnings, p_amount_sen;
  END IF;

  UPDATE wallets
     SET earnings_sen = earnings_sen - p_amount_sen,
         updated_at   = now()
   WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES
    (p_user_id, v_wallet_id, 'withdrawal_reserve', p_amount_sen, 'earnings', 'debit',
     p_withdrawal_id, 'Withdrawal reserved — pending payout');
END;
$$;


-- ── 9. cancel_withdrawal — restore earnings_sen on rejection / failure ────────
CREATE OR REPLACE FUNCTION cancel_withdrawal(
  p_user_id       UUID,
  p_withdrawal_id UUID,
  p_note          TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_amount    BIGINT;
BEGIN
  SELECT wt.wallet_id, wt.amount_sen
    INTO v_wallet_id, v_amount
    FROM wallet_transactions wt
   WHERE wt.withdrawal_id = p_withdrawal_id
     AND wt.type          = 'withdrawal_reserve'
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_reserve_found for withdrawal %', p_withdrawal_id;
  END IF;

  UPDATE wallets
     SET earnings_sen = earnings_sen + v_amount,
         updated_at   = now()
   WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES
    (p_user_id, v_wallet_id, 'withdrawal_cancel', v_amount, 'earnings', 'credit',
     p_withdrawal_id, COALESCE(p_note, 'Withdrawal cancelled — funds restored'));
END;
$$;


-- ── 10. complete_withdrawal — settlement record after payout.paid ─────────────
CREATE OR REPLACE FUNCTION complete_withdrawal(
  p_user_id       UUID,
  p_withdrawal_id UUID,
  p_stripe_ref    TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_amount    BIGINT;
BEGIN
  SELECT wt.wallet_id, wt.amount_sen
    INTO v_wallet_id, v_amount
    FROM wallet_transactions wt
   WHERE wt.withdrawal_id = p_withdrawal_id
     AND wt.type          = 'withdrawal_reserve'
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_reserve_found for withdrawal %', p_withdrawal_id;
  END IF;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, stripe_ref, note)
  VALUES
    (p_user_id, v_wallet_id, 'withdrawal_complete', v_amount, 'earnings', 'debit',
     p_withdrawal_id, p_stripe_ref, 'Payout settled to bank');
END;
$$;


-- ── Grants for service_role (webhook handlers) ────────────────────────────────
GRANT EXECUTE ON FUNCTION credit_topup(UUID, BIGINT, TEXT, TEXT)    TO service_role;
GRANT EXECUTE ON FUNCTION credit_earnings(UUID, BIGINT, UUID, TEXT)  TO service_role;
GRANT EXECUTE ON FUNCTION reserve_for_withdrawal(UUID, BIGINT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_withdrawal(UUID, UUID, TEXT)        TO service_role;
GRANT EXECUTE ON FUNCTION complete_withdrawal(UUID, UUID, TEXT)      TO service_role;
