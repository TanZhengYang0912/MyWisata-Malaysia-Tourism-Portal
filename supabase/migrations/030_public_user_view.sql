-- ============================================================
-- 030_public_user_view.sql — public_users view for column-level isolation
--
-- Exposes only the columns safe to show to other platform users.
-- Sensitive columns (phone, kyc_document_url, bio_violation_count, tier, etc.)
-- are excluded. kyc_verified_at is exposed as a boolean only.
-- ============================================================


-- ── public_users view ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public_users AS
SELECT
  id,
  full_name,
  display_name,
  avatar_url,
  city,
  country,
  -- Expose verification as boolean only — timestamp is internal
  (kyc_status = 'approved') AS is_kyc_verified,
  -- Expose that profile was completed without leaking when
  (profile_completed_at IS NOT NULL) AS has_completed_profile,
  created_at
FROM users
WHERE status = 'active';


-- ── RLS on the view ───────────────────────────────────────────────────────────
-- Any authenticated user can read any row through this view.
-- (Table-level RLS still restricts direct access to the users table.)
ALTER VIEW public_users OWNER TO postgres;

GRANT SELECT ON public_users TO authenticated, anon;
