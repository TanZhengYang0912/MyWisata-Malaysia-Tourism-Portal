-- ============================================================
-- 031_preference_survey.sql — Preference survey schema + atomic RPC
--
-- 1. preference_survey_responses table (one per user, UNIQUE user_id)
-- 2. complete_preference_survey(user_id, ...) — insert + promote atomically
-- 3. Update promote_to_profile_complete to also require survey
-- ============================================================


-- ── 1. preference_survey_responses ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS preference_survey_responses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interests      TEXT[]      NOT NULL DEFAULT '{}',
  travel_style   TEXT        NOT NULL CHECK (travel_style IN ('solo','couple','family','group')),
  budget_range   TEXT        NOT NULL CHECK (budget_range IN ('budget','mid_range','luxury')),
  mobility_needs TEXT        NOT NULL DEFAULT 'none' CHECK (mobility_needs IN ('none','limited','wheelchair')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_user_id ON preference_survey_responses(user_id);

ALTER TABLE preference_survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS survey_select_own ON preference_survey_responses;
CREATE POLICY survey_select_own
  ON preference_survey_responses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS survey_insert_own ON preference_survey_responses;
CREATE POLICY survey_insert_own
  ON preference_survey_responses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS survey_update_own ON preference_survey_responses;
CREATE POLICY survey_update_own
  ON preference_survey_responses FOR UPDATE TO authenticated
  USING (user_id = auth.uid());


-- ── 2. complete_preference_survey — atomic insert + promote ──────────────────
-- Inserts survey answers and, if all profile criteria are met, advances tier.
-- Re-submission is idempotent (EXCEPTION block catches UNIQUE violation).
CREATE OR REPLACE FUNCTION complete_preference_survey(
  p_user_id        UUID,
  p_interests      TEXT[],
  p_travel_style   TEXT,
  p_budget_range   TEXT,
  p_mobility_needs TEXT DEFAULT 'none'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  BEGIN
    INSERT INTO preference_survey_responses
      (user_id, interests, travel_style, budget_range, mobility_needs)
    VALUES
      (p_user_id, p_interests, p_travel_style, p_budget_range, p_mobility_needs);
  EXCEPTION
    WHEN unique_violation THEN
      -- Already submitted — update preferences silently
      UPDATE preference_survey_responses
         SET interests      = p_interests,
             travel_style   = p_travel_style,
             budget_range   = p_budget_range,
             mobility_needs = p_mobility_needs,
             updated_at     = now()
       WHERE user_id = p_user_id;
  END;

  -- Attempt tier promotion — fails silently if criteria not yet met
  BEGIN
    PERFORM promote_to_profile_complete(p_user_id);
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END;
$$;
GRANT EXECUTE ON FUNCTION complete_preference_survey(UUID, TEXT[], TEXT, TEXT, TEXT) TO authenticated;


-- ── 3. Update promote_to_profile_complete to require survey ──────────────────
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

  IF tier_rank(v_row.tier) < tier_rank('phone_verified') THEN
    RAISE EXCEPTION 'tier_insufficient: phone_verified required before profile_complete';
  END IF;

  IF tier_rank(v_row.tier) >= tier_rank('profile_complete') THEN
    RETURN;
  END IF;

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

  -- Survey is required (added in migration 031)
  IF NOT EXISTS (SELECT 1 FROM preference_survey_responses WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'profile_incomplete: preference survey required';
  END IF;

  UPDATE users
     SET tier                 = 'profile_complete',
         profile_completed_at = COALESCE(profile_completed_at, now()),
         updated_at           = now()
   WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION promote_to_profile_complete(UUID) TO authenticated;
