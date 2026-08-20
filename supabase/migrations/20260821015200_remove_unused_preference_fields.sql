-- Remove preference answers that are not consumed by recommendation scoring,
-- then replace the survey RPC with the reduced supported-field contract.

BEGIN;

DROP FUNCTION IF EXISTS public.complete_preference_survey(
  UUID, TEXT[], TEXT, TEXT, TEXT, TEXT[], BOOLEAN, INTEGER, TEXT
);

ALTER TABLE public.preference_survey_responses
  DROP COLUMN IF EXISTS travel_style,
  DROP COLUMN IF EXISTS group_composition;

CREATE OR REPLACE FUNCTION public.complete_preference_survey(
  p_user_id             UUID,
  p_interests           TEXT[],
  p_budget_range        TEXT,
  p_mobility_needs      TEXT    DEFAULT 'none',
  p_pet_friendly        BOOLEAN DEFAULT FALSE,
  p_preferred_radius_km INTEGER DEFAULT 20,
  p_notes               TEXT    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO public.preference_survey_responses
    (user_id, interests, budget_range, mobility_needs, pet_friendly,
     preferred_radius_km, notes)
  VALUES
    (p_user_id, p_interests, p_budget_range, p_mobility_needs, p_pet_friendly,
     p_preferred_radius_km, p_notes)
  ON CONFLICT (user_id) DO UPDATE
    SET interests           = EXCLUDED.interests,
        budget_range        = EXCLUDED.budget_range,
        mobility_needs      = EXCLUDED.mobility_needs,
        pet_friendly        = EXCLUDED.pet_friendly,
        preferred_radius_km = EXCLUDED.preferred_radius_km,
        notes               = EXCLUDED.notes,
        updated_at          = now();

  BEGIN
    PERFORM promote_to_profile_complete(p_user_id);
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_preference_survey(
  UUID, TEXT[], TEXT, TEXT, BOOLEAN, INTEGER, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.complete_preference_survey(
  UUID, TEXT[], TEXT, TEXT, BOOLEAN, INTEGER, TEXT
) TO authenticated;

COMMIT;
