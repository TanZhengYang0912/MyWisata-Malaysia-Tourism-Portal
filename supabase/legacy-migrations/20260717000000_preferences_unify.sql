-- ============================================================
-- 20260717000000_preferences_unify.sql — §11.1/§11.2 groundwork
--
-- 1. Add the missing 'nightlife' interest category (7 of 8 already exist).
-- 2. Make preference_survey_responses the single source of truth: add the
--    spec fields user_preferences had, fix the mislabeled travel_style, add a
--    free-text notes box + activity-learned affinity map.
-- 3. Update complete_preference_survey RPC to persist the new fields.
-- 4. Drop the dead user_preferences table (zero readers).
-- 5. Give outlets an accessibility flag so §11.1.5 has a supply side.
--
-- Re-runnable: IF NOT EXISTS / DROP POLICY IF EXISTS throughout.
-- ============================================================


-- ── 1. Nightlife category ────────────────────────────────────────────────────
INSERT INTO categories (name, slug, icon, sort_order)
VALUES ('Nightlife', 'nightlife', 'moon', 9)
ON CONFLICT (slug) DO NOTHING;


-- ── 2. Widen preference_survey_responses ─────────────────────────────────────
-- interests already TEXT[] — semantics change to category slugs (food, nature…).
ALTER TABLE preference_survey_responses
  ADD COLUMN IF NOT EXISTS group_composition TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pet_friendly       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preferred_radius_km INTEGER    NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS notes              TEXT,
  -- activity-learned category weights, e.g. {"food":4,"nature":2}
  ADD COLUMN IF NOT EXISTS learned_affinity   JSONB       NOT NULL DEFAULT '{}';

-- Drop the orphaned text distance column (values walking/nearby/travel/…): the
-- whole app uses the numeric preferred_radius_km. DROP COLUMN also removes its
-- CHECK constraint. Keeps this table a single source of truth for distance.
ALTER TABLE preference_survey_responses
  DROP COLUMN IF EXISTS preferred_distance;

-- travel_style used to hold GROUP-composition values (solo/couple/family/group).
-- Migrate those into group_composition, then repurpose travel_style for the real
-- §11.1 Travel Style vocabulary.
UPDATE preference_survey_responses
   SET group_composition = ARRAY[travel_style]
 WHERE travel_style IN ('solo','couple','family','group')
   AND group_composition = '{}';

ALTER TABLE preference_survey_responses
  DROP CONSTRAINT IF EXISTS preference_survey_responses_travel_style_check;

-- Any legacy value is now meaningless for the new meaning → default to mid_range.
UPDATE preference_survey_responses
   SET travel_style = 'mid_range'
 WHERE travel_style NOT IN
   ('budget_backpacker','mid_range','luxury','business','family_group');

ALTER TABLE preference_survey_responses
  ALTER COLUMN travel_style SET DEFAULT 'mid_range',
  ADD CONSTRAINT preference_survey_responses_travel_style_check
    CHECK (travel_style IN
      ('budget_backpacker','mid_range','luxury','business','family_group'));


-- ── 3. complete_preference_survey — persist the new fields ───────────────────
-- Old signatures are superseded; drop them so the new one is unambiguous.
-- (Both the legacy 5-arg and the interim 6-arg preferred_distance variant.)
DROP FUNCTION IF EXISTS complete_preference_survey(UUID, TEXT[], TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS complete_preference_survey(UUID, TEXT[], TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION complete_preference_survey(
  p_user_id             UUID,
  p_interests           TEXT[],
  p_travel_style        TEXT,
  p_budget_range        TEXT,
  p_mobility_needs      TEXT    DEFAULT 'none',
  p_group_composition   TEXT[]  DEFAULT '{}',
  p_pet_friendly        BOOLEAN DEFAULT FALSE,
  p_preferred_radius_km INTEGER DEFAULT 20,
  p_notes               TEXT    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  BEGIN
    INSERT INTO preference_survey_responses
      (user_id, interests, travel_style, budget_range, mobility_needs,
       group_composition, pet_friendly, preferred_radius_km, notes)
    VALUES
      (p_user_id, p_interests, p_travel_style, p_budget_range, p_mobility_needs,
       p_group_composition, p_pet_friendly, p_preferred_radius_km, p_notes);
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE preference_survey_responses
         SET interests           = p_interests,
             travel_style        = p_travel_style,
             budget_range        = p_budget_range,
             mobility_needs      = p_mobility_needs,
             group_composition   = p_group_composition,
             pet_friendly        = p_pet_friendly,
             preferred_radius_km = p_preferred_radius_km,
             notes               = p_notes,
             updated_at          = now()
       WHERE user_id = p_user_id;
  END;

  BEGIN
    PERFORM promote_to_profile_complete(p_user_id);
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END;
$$;
GRANT EXECUTE ON FUNCTION complete_preference_survey(
  UUID, TEXT[], TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER, TEXT) TO authenticated;


-- ── 4. Drop the dead table ───────────────────────────────────────────────────
DROP TABLE IF EXISTS user_preferences CASCADE;


-- ── 5. Outlet accessibility (supply side for §11.1.5) ────────────────────────
-- NULL = vendor hasn't answered (the day-1 state). We never hide unknowns; the
-- feed only badges/boosts explicit TRUE. See backend/domains/recommend.ts.
ALTER TABLE outlets
  ADD COLUMN IF NOT EXISTS wheelchair_accessible BOOLEAN,
  ADD COLUMN IF NOT EXISTS pet_friendly          BOOLEAN;


-- ── 6. Collaborative filtering (§11.2.2) ─────────────────────────────────────
-- Item-based co-occurrence: products engaged by users who engaged the same
-- products as p_user_id. SECURITY DEFINER so it can read across users, but it
-- returns only anonymised (product_id, score) — never any peer's identity.
CREATE OR REPLACE FUNCTION collaborative_recommendations(p_user_id UUID, p_limit INT DEFAULT 20)
RETURNS TABLE(product_id UUID, score NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH my_items AS (
    SELECT DISTINCT entity_id FROM user_interactions
    WHERE user_id = p_user_id AND entity_type = 'product'
  ),
  peers AS (
    SELECT DISTINCT ui.user_id FROM user_interactions ui
    JOIN my_items m ON m.entity_id = ui.entity_id
    WHERE ui.entity_type = 'product' AND ui.user_id <> p_user_id
  )
  SELECT ui.entity_id AS product_id, COUNT(*)::numeric AS score
  FROM user_interactions ui
  JOIN peers p ON p.user_id = ui.user_id
  WHERE ui.entity_type = 'product'
    AND ui.entity_id NOT IN (SELECT entity_id FROM my_items)
  GROUP BY ui.entity_id
  ORDER BY score DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION collaborative_recommendations(UUID, INT) TO authenticated;


-- ── 7. Learned affinity refresh (§11.2.7 "memory") ───────────────────────────
-- Aggregates a user's own interactions into category weights and writes them to
-- their preference row. Weighted view<save<book<rate. Call after recording a
-- signal. SECURITY DEFINER + self-or-admin check.
CREATE OR REPLACE FUNCTION refresh_learned_affinity(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_affinity JSONB;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT COALESCE(jsonb_object_agg(slug, weight), '{}'::jsonb) INTO v_affinity
  FROM (
    SELECT c.slug, SUM(
      CASE ui.event_type
        WHEN 'view' THEN 1 WHEN 'save' THEN 3 WHEN 'book' THEN 5
        WHEN 'rate' THEN 4 WHEN 'share' THEN 2 ELSE 1 END
    ) AS weight
    FROM user_interactions ui
    JOIN products p ON p.id = ui.entity_id AND ui.entity_type = 'product'
    JOIN categories c ON c.id = p.category_id
    WHERE ui.user_id = p_user_id
    GROUP BY c.slug
  ) t;

  UPDATE preference_survey_responses
     SET learned_affinity = v_affinity, updated_at = now()
   WHERE user_id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION refresh_learned_affinity(UUID) TO authenticated;


-- ── 8. Ensure feedback-loop writes are grantable (§11.2.7) ───────────────────
-- interactions_own RLS (007) already scopes rows to auth.uid(); make sure the
-- base privilege exists so the app can INSERT its own signals.
GRANT SELECT, INSERT ON user_interactions TO authenticated;
