ALTER TABLE public.preference_survey_responses
  ADD COLUMN IF NOT EXISTS preferred_distance TEXT NOT NULL DEFAULT 'no_preference'
  CHECK (preferred_distance IN ('walking', 'nearby', 'travel', 'anywhere', 'no_preference'));

DROP FUNCTION IF EXISTS public.complete_preference_survey(UUID, TEXT[], TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.complete_preference_survey(
  p_user_id UUID, p_interests TEXT[], p_travel_style TEXT, p_budget_range TEXT,
  p_mobility_needs TEXT, p_preferred_distance TEXT DEFAULT 'no_preference'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF COALESCE(array_length(p_interests, 1), 0) = 0 THEN RAISE EXCEPTION 'interests_required'; END IF;
  IF p_travel_style NOT IN ('solo', 'couple', 'family', 'group') THEN RAISE EXCEPTION 'invalid_travel_style'; END IF;
  IF p_budget_range NOT IN ('budget', 'mid_range', 'luxury') THEN RAISE EXCEPTION 'invalid_budget_range'; END IF;
  IF p_mobility_needs NOT IN ('none', 'limited', 'wheelchair') THEN RAISE EXCEPTION 'invalid_mobility_needs'; END IF;
  IF p_preferred_distance NOT IN ('walking', 'nearby', 'travel', 'anywhere', 'no_preference') THEN RAISE EXCEPTION 'invalid_preferred_distance'; END IF;
  INSERT INTO preference_survey_responses (user_id, interests, travel_style, budget_range, mobility_needs, preferred_distance)
  VALUES (p_user_id, p_interests, p_travel_style, p_budget_range, p_mobility_needs, p_preferred_distance)
  ON CONFLICT (user_id) DO UPDATE SET interests = EXCLUDED.interests, travel_style = EXCLUDED.travel_style,
    budget_range = EXCLUDED.budget_range, mobility_needs = EXCLUDED.mobility_needs,
    preferred_distance = EXCLUDED.preferred_distance, updated_at = now();
  PERFORM promote_to_profile_complete(p_user_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_preference_survey(UUID, TEXT[], TEXT, TEXT, TEXT, TEXT) TO authenticated;
