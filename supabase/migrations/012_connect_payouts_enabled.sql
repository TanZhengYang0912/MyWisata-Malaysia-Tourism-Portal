-- ============================================================
-- 012_connect_payouts_enabled.sql — Phase 4: Connect status
--
-- Adds:
--   · stripe_payouts_enabled on users (synced from account.updated webhook)
--   · RPC: update_connect_status (callable by anon — webhook auth gate)
-- ============================================================


-- ── 1. stripe_payouts_enabled on users ───────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE;


-- ── 2. update_connect_status — called from Connect webhook ───────────────────
CREATE OR REPLACE FUNCTION update_connect_status(
  p_connect_account_id TEXT,
  p_payouts_enabled    BOOLEAN
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
     SET stripe_payouts_enabled = p_payouts_enabled,
         updated_at             = now()
   WHERE stripe_connect_account_id = p_connect_account_id;
END;
$$;

-- Webhook handler uses anon key; Stripe signature is the auth gate.
GRANT EXECUTE ON FUNCTION update_connect_status(TEXT, BOOLEAN) TO anon;
