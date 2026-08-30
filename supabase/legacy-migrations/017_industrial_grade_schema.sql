-- ============================================================
-- 017_industrial_grade_schema.sql — Schema additions for
-- industrial-grade modules (Phase 2 hardening)
--
-- 1. recommendation_conversions: attribution_ends_at, first_sale_awarded_at
-- 2. recommendation_commissions: status lifecycle + hold window columns
-- 3. kyc_submissions: ic_hash (SHA-256 of IC number, replaces plain text)
-- 4. kyc_submissions: ensure UNIQUE(user_id) constraint exists
-- 5. platform_settings: recommendation.attribution_window_days = 90
-- ============================================================


-- ── 1. Recommendation conversion attribution window ───────────────────────────
ALTER TABLE recommendation_conversions
  ADD COLUMN IF NOT EXISTS attribution_ends_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_sale_awarded_at  TIMESTAMPTZ;


-- ── 2. Recommendation commission lifecycle tracking ───────────────────────────
ALTER TABLE recommendation_commissions
  ADD COLUMN IF NOT EXISTS status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS hold_until      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wallet_txn_id   UUID,
  ADD COLUMN IF NOT EXISTS order_id        UUID,
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS confirmed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at     TIMESTAMPTZ;

ALTER TABLE recommendation_commissions
  DROP CONSTRAINT IF EXISTS recommendation_commissions_status_check;

ALTER TABLE recommendation_commissions
  ADD CONSTRAINT recommendation_commissions_status_check
  CHECK (status IN ('pending', 'confirmed', 'reversed'));


-- ── 3. KYC submissions: IC hash column ───────────────────────────────────────
ALTER TABLE kyc_submissions
  ADD COLUMN IF NOT EXISTS ic_hash TEXT;


-- ── 4. Ensure kyc_submissions has UNIQUE(user_id) for upsert ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'kyc_submissions'::regclass
       AND contype  = 'u'
       AND conname  = 'kyc_submissions_user_id_key'
  ) THEN
    -- Remove duplicate rows (keep oldest) before adding constraint
    DELETE FROM kyc_submissions ks
      WHERE id NOT IN (
        SELECT DISTINCT ON (user_id) id
          FROM kyc_submissions
         ORDER BY user_id, created_at ASC
      );
    ALTER TABLE kyc_submissions
      ADD CONSTRAINT kyc_submissions_user_id_key UNIQUE (user_id);
  END IF;
END $$;


-- ── 5. Platform setting: recommendation attribution window ────────────────────
INSERT INTO platform_settings (key, value, description)
SELECT 'recommendation.attribution_window_days', '90',
       'Days the recommendation commission window stays open after vendor conversion'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings
   WHERE key = 'recommendation.attribution_window_days'
);
