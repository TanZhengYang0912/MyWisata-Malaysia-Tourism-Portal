-- ============================================================
-- 020_stripe_transfer_idempotency.sql — PR 020: Stripe transfer atomicity
--
-- Gap 5: admin approve route created a Stripe Transfer before writing the
-- transfer ID to DB. A crash or network failure between those two steps left
-- status='approved' with stripe_transfer_id=NULL. Admin retry → new
-- stripe.transfers.create() call → double transfer.
--
-- Fix:
--   1. record_stripe_transfer RPC — saves stripe_transfer_id immediately
--      after the Transfer is created, BEFORE the Payout call. Retry path
--      reads this column; if set, retrieves the existing Transfer instead of
--      creating a new one.
--   2. API route adds Stripe idempotency keys to both Transfer and Payout
--      calls (deterministic: wr-{withdrawal_id}-transfer / -payout). Stripe
--      returns the same object on any retry within 24 h.
--
-- Columns stripe_transfer_id and stripe_payout_id already exist on
-- withdrawal_requests (added in 011_stripe_connect_withdrawal.sql).
-- No schema changes needed here.
-- ============================================================


-- ── 1. record_stripe_transfer ─────────────────────────────────────────────────
-- Called immediately after stripe.transfers.create() succeeds, before the
-- Payout call. Persists the transfer ID so a retry knows the Transfer already
-- exists and can retrieve it instead of creating a duplicate.
CREATE OR REPLACE FUNCTION record_stripe_transfer(
  p_withdrawal_id UUID,
  p_transfer_id   TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Only update if status is still 'approved' and transfer not yet recorded.
  -- If stripe_transfer_id is already set (concurrent retry), leave it alone.
  UPDATE withdrawal_requests
     SET stripe_transfer_id = p_transfer_id,
         updated_at          = now()
   WHERE id                  = p_withdrawal_id
     AND status              = 'approved'
     AND stripe_transfer_id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION record_stripe_transfer(UUID, TEXT) TO authenticated;
