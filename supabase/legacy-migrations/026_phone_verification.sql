-- ============================================================
-- 026_phone_verification.sql — Real phone OTP infrastructure
--
-- 1. Index on phone_verifications.phone for fast rate-limit queries
-- 2. Partial UNIQUE index: only one verified-phone claim per number
-- 3. check_phone_collision(phone, user_id) — pre-send collision RPC
-- ============================================================


-- ── 1. Index on phone for rate-limit count queries ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_phone_verif_phone_time
  ON phone_verifications(phone, created_at DESC);


-- ── 2. Globally unique verified phone ─────────────────────────────────────────
-- Enforced at the DB layer so concurrent verify-otp calls cannot race to claim
-- the same number for two accounts.  Partial index covers only verified rows —
-- unverified rows may share a phone (user types wrong number then corrects it).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_verified_phone
  ON users(phone)
  WHERE phone_verified_at IS NOT NULL;


-- ── 3. check_phone_collision — pre-send OTP guard ─────────────────────────────
-- Called by /api/phone/send-otp before issuing the Twilio request.
-- Returns TRUE if the phone is already verified on a DIFFERENT account (collision).
-- Returns FALSE if safe to proceed.
CREATE OR REPLACE FUNCTION check_phone_collision(
  p_phone   TEXT,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
     WHERE phone             = p_phone
       AND phone_verified_at IS NOT NULL
       AND id                <> p_user_id
  );
$$;
GRANT EXECUTE ON FUNCTION check_phone_collision(TEXT, UUID) TO authenticated;
