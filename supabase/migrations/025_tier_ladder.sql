-- ============================================================
-- 025_tier_ladder.sql — Tier ladder: column, promote RPCs, admin escape hatch
--
-- 1. tier column on users (email_verified → phone_verified → profile_complete → kyc_verified)
-- 2. tier_rank() helper for ordered comparison
-- 3. promote_to_phone_verified(user_id, phone)
-- 4. promote_to_profile_complete(user_id)   — checks name + city + avatar + bio
-- 5. promote_to_kyc_verified(user_id)       — admin-only
-- 6. admin_set_tier(user_id, tier, reason)  — escape hatch, full audit
-- 7. Update admin_review_kyc to drive tier via promote RPCs
-- 8. P3 backfill: infer tier from existing kyc_submissions rows
-- ============================================================


-- ── 0. Normalise kyc_status — fix any rows written by buggy migrations 018/019
--    that set kyc_status to tier-vocabulary values. The live database may still
--    have a stale CHECK that accepts those tier values but rejects 'approved',
--    so drop it before normalising the data.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_kyc_status_check;

UPDATE users
   SET kyc_status = 'approved'
 WHERE kyc_status IN ('kyc_verified', 'kyc_submitted', 'profile_complete', 'phone_verified', 'email_verified');

UPDATE users
   SET kyc_status = 'rejected'
 WHERE kyc_status NOT IN ('unverified', 'pending', 'approved', 'rejected');

-- Re-establish users_kyc_status_check with the authoritative set of values so
-- subsequent statements in this migration cannot hit a stale constraint definition.
ALTER TABLE users
  ADD CONSTRAINT users_kyc_status_check
    CHECK (kyc_status IN ('unverified', 'pending', 'approved', 'rejected'));


-- ── 1. tier column ────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'email_verified';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'users'::regclass AND conname = 'users_tier_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_tier_check
        CHECK (tier IN ('email_verified','phone_verified','profile_complete','kyc_verified'));
  END IF;
END $$;

-- Fast lookup for gate queries
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);


-- ── 2. P3 backfill: infer tier from existing kyc_submissions ─────────────────
-- Users who have an approved KYC submission → kyc_verified
-- (kyc_status was already normalised to 'approved' in step 0 above)
UPDATE users u
   SET tier = 'kyc_verified', updated_at = NOW()
 WHERE EXISTS (
   SELECT 1 FROM kyc_submissions ks
    WHERE ks.user_id = u.id AND ks.status = 'approved'
 );

-- Users who have ANY kyc_submission (submitted ≥ once) → profile_complete (at minimum)
UPDATE users u
   SET tier = 'profile_complete',
       profile_completed_at = COALESCE(u.profile_completed_at, NOW()),
       updated_at = NOW()
 WHERE u.tier = 'email_verified'
   AND EXISTS (SELECT 1 FROM kyc_submissions ks WHERE ks.user_id = u.id);


-- ── 3. tier_rank() — ordered comparison helper ────────────────────────────────
CREATE OR REPLACE FUNCTION tier_rank(p_tier TEXT) RETURNS INT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE p_tier
    WHEN 'email_verified'   THEN 1
    WHEN 'phone_verified'   THEN 2
    WHEN 'profile_complete' THEN 3
    WHEN 'kyc_verified'     THEN 4
    ELSE 0
  END;
$$;


-- ── 4. promote_to_phone_verified ──────────────────────────────────────────────
-- Called by /api/phone/verify-otp after Twilio confirms the OTP.
-- Records the verified phone and advances tier exactly once (idempotent above).
CREATE OR REPLACE FUNCTION promote_to_phone_verified(
  p_user_id UUID,
  p_phone   TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Advance from email_verified only; already higher = idempotent success
  UPDATE users
     SET tier             = 'phone_verified',
         phone            = p_phone,
         phone_verified_at = now(),
         updated_at       = now()
   WHERE id = p_user_id
     AND tier = 'email_verified';

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'user_not_found: %', p_user_id;
    END IF;
    -- Already at phone_verified or higher: update phone + timestamp but not tier
    UPDATE users
       SET phone             = p_phone,
           phone_verified_at = now(),
           updated_at        = now()
     WHERE id = p_user_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION promote_to_phone_verified(UUID, TEXT) TO authenticated;


-- ── 5. promote_to_profile_complete ────────────────────────────────────────────
-- Called by profile routes after all required fields are confirmed.
-- Checks: full_name + city + avatar_url + bio. (Survey check added in migration 031.)
CREATE OR REPLACE FUNCTION promote_to_profile_complete(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT tier, full_name, city, avatar_url, bio
    INTO v_row
    FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;

  -- Precondition: must be at least phone_verified
  IF tier_rank(v_row.tier) < tier_rank('phone_verified') THEN
    RAISE EXCEPTION 'tier_insufficient: phone_verified required before profile_complete';
  END IF;

  -- Already at or above profile_complete: idempotent return
  IF tier_rank(v_row.tier) >= tier_rank('profile_complete') THEN
    RETURN;
  END IF;

  -- Profile field checks
  IF v_row.full_name IS NULL OR trim(v_row.full_name) = '' THEN
    RAISE EXCEPTION 'profile_incomplete: full_name required';
  END IF;
  IF v_row.city IS NULL THEN
    RAISE EXCEPTION 'profile_incomplete: city required';
  END IF;
  IF v_row.avatar_url IS NULL THEN
    RAISE EXCEPTION 'profile_incomplete: avatar_url required';
  END IF;
  IF v_row.bio IS NULL OR trim(v_row.bio) = '' THEN
    RAISE EXCEPTION 'profile_incomplete: bio required';
  END IF;

  UPDATE users
     SET tier                 = 'profile_complete',
         profile_completed_at = COALESCE(profile_completed_at, now()),
         updated_at           = now()
   WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION promote_to_profile_complete(UUID) TO authenticated;


-- ── 6. promote_to_kyc_verified ────────────────────────────────────────────────
-- Admin-only. Called after KYC document is manually approved.
-- Requires user to already be at profile_complete tier.
CREATE OR REPLACE FUNCTION promote_to_kyc_verified(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  UPDATE users
     SET tier        = 'kyc_verified',
         kyc_status  = 'approved',
         updated_at  = now()
   WHERE id = p_user_id
     AND tier_rank(tier) >= tier_rank('profile_complete');

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'user_not_found: %', p_user_id;
    END IF;
    RAISE EXCEPTION 'tier_insufficient: profile_complete required before kyc_verified';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION promote_to_kyc_verified(UUID) TO authenticated;


-- ── 7. admin_set_tier — escape hatch ──────────────────────────────────────────
-- Bypasses precondition guards. Every call is audit-logged. Service role only.
CREATE OR REPLACE FUNCTION admin_set_tier(
  p_user_id UUID,
  p_tier    TEXT,
  p_reason  TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF p_tier NOT IN ('email_verified','phone_verified','profile_complete','kyc_verified') THEN
    RAISE EXCEPTION 'invalid_tier: %', p_tier;
  END IF;

  UPDATE users SET tier = p_tier, updated_at = now() WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (auth.uid(), 'tier.admin_set', 'user', p_user_id,
          jsonb_build_object('tier', p_tier), p_reason);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_set_tier(UUID, TEXT, TEXT) TO authenticated;


-- ── 8. Update admin_review_kyc to drive tier via promote RPC ──────────────────
-- Replaces the 019 version which tried to write 'kyc_verified'/'profile_complete'
-- directly to users.kyc_status (violated the CHECK constraint — writes silently
-- did nothing). Now calls promote_to_kyc_verified() which is the single path.
CREATE OR REPLACE FUNCTION admin_review_kyc(
  p_user_id UUID,
  p_action  TEXT,
  p_reason  TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid_action: %', p_action;
  END IF;

  -- State guard: only transition from 'pending'
  UPDATE kyc_submissions
     SET status           = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
         reviewed_at      = now(),
         reviewer_id      = auth.uid(),
         rejection_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE NULL END
   WHERE user_id = p_user_id
     AND status  = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'kyc_not_pending_or_not_found: %', p_user_id;
  END IF;

  IF p_action = 'approve' THEN
    -- Promote tier (requires profile_complete; admin_set_tier escape hatch if not)
    PERFORM promote_to_kyc_verified(p_user_id);
    -- Auto-provision affiliate link (idempotent)
    PERFORM gen_affiliate_code(p_user_id);
  ELSE
    UPDATE users
       SET kyc_status = 'rejected', updated_at = now()
     WHERE id = p_user_id;
  END IF;

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (auth.uid(), 'kyc.' || p_action, 'user', p_user_id,
          jsonb_build_object('action', p_action), p_reason);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_review_kyc(UUID, TEXT, TEXT) TO authenticated;
