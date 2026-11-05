-- Narrow authenticated, owner-scoped no-op saves for customer profile data.
-- These functions retain RLS and never accept an arbitrary owner from the client.
CREATE OR REPLACE FUNCTION public.save_personal_travel_details_if_changed(
  p_legal_name text,
  p_date_of_birth date,
  p_gender text,
  p_nationality_code text,
  p_emergency_contact_name text,
  p_emergency_contact_relationship text,
  p_emergency_contact_phone text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_changed boolean := false;
BEGIN
  IF v_user_id IS NULL OR coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false)
     OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id AND u.status = 'active') THEN
    RAISE EXCEPTION 'profile_owner_unavailable' USING ERRCODE = '42501';
  END IF;

  IF p_legal_name IS NULL AND p_date_of_birth IS NULL AND p_gender IS NULL AND p_nationality_code IS NULL
     AND p_emergency_contact_name IS NULL AND p_emergency_contact_relationship IS NULL AND p_emergency_contact_phone IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.profile_personal_details AS current_row (
    user_id, legal_name, date_of_birth, gender, nationality_code,
    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone
  ) VALUES (
    v_user_id, p_legal_name, p_date_of_birth, p_gender, p_nationality_code,
    p_emergency_contact_name, p_emergency_contact_relationship, p_emergency_contact_phone
  ) ON CONFLICT (user_id) DO UPDATE SET
    legal_name = EXCLUDED.legal_name,
    date_of_birth = EXCLUDED.date_of_birth,
    gender = EXCLUDED.gender,
    nationality_code = EXCLUDED.nationality_code,
    emergency_contact_name = EXCLUDED.emergency_contact_name,
    emergency_contact_relationship = EXCLUDED.emergency_contact_relationship,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone
  WHERE (current_row.legal_name, current_row.date_of_birth, current_row.gender, current_row.nationality_code,
         current_row.emergency_contact_name, current_row.emergency_contact_relationship, current_row.emergency_contact_phone)
    IS DISTINCT FROM
        (EXCLUDED.legal_name, EXCLUDED.date_of_birth, EXCLUDED.gender, EXCLUDED.nationality_code,
         EXCLUDED.emergency_contact_name, EXCLUDED.emergency_contact_relationship, EXCLUDED.emergency_contact_phone)
  RETURNING true INTO v_changed;
  RETURN coalesce(v_changed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_saved_traveller_if_changed(
  p_traveller_id uuid,
  p_legal_name text,
  p_date_of_birth date,
  p_gender text,
  p_nationality_code text,
  p_emergency_contact_name text,
  p_emergency_contact_relationship text,
  p_emergency_contact_phone text,
  p_contact_phone text,
  p_relationship text
) RETURNS TABLE(changed boolean)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL OR coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false)
     OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id AND u.status = 'active') THEN
    RAISE EXCEPTION 'profile_owner_unavailable' USING ERRCODE = '42501';
  END IF;

  UPDATE public.saved_travellers AS current_row SET
    legal_name = p_legal_name,
    date_of_birth = p_date_of_birth,
    gender = p_gender,
    nationality_code = p_nationality_code,
    emergency_contact_name = p_emergency_contact_name,
    emergency_contact_relationship = p_emergency_contact_relationship,
    emergency_contact_phone = p_emergency_contact_phone,
    contact_phone = p_contact_phone,
    relationship = p_relationship
  WHERE current_row.id = p_traveller_id AND current_row.user_id = v_user_id
    AND (current_row.legal_name, current_row.date_of_birth, current_row.gender, current_row.nationality_code,
         current_row.emergency_contact_name, current_row.emergency_contact_relationship, current_row.emergency_contact_phone,
         current_row.contact_phone, current_row.relationship)
      IS DISTINCT FROM
        (p_legal_name, p_date_of_birth, p_gender, p_nationality_code,
         p_emergency_contact_name, p_emergency_contact_relationship, p_emergency_contact_phone,
         p_contact_phone, p_relationship);
  RETURN QUERY SELECT FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_profile_identity_if_changed(
  p_full_name text,
  p_city text,
  p_country text,
  p_city_id uuid,
  p_country_code text,
  p_city_source text
) RETURNS TABLE(changed boolean, tier text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL OR coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false)
     OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id AND u.status = 'active') THEN
    RAISE EXCEPTION 'profile_owner_unavailable' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users AS current_row SET
    full_name = p_full_name,
    city = p_city,
    country = p_country,
    city_id = p_city_id,
    country_code = p_country_code,
    city_source = p_city_source,
    updated_at = clock_timestamp()
  WHERE current_row.id = v_user_id
    AND (current_row.full_name, current_row.city, current_row.country, current_row.city_id, current_row.country_code, current_row.city_source)
      IS DISTINCT FROM (p_full_name, p_city, p_country, p_city_id, p_country_code, p_city_source);

  RETURN QUERY SELECT FOUND, u.tier::text FROM public.users u WHERE u.id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_preference_survey_if_changed(
  p_interests text[], p_travel_style text, p_budget_range text, p_mobility_needs text,
  p_pet_friendly boolean, p_preferred_radius_km integer, p_notes text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_changed boolean := false;
BEGIN
  IF v_user_id IS NULL OR coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false)
     OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id AND u.status = 'active') THEN
    RAISE EXCEPTION 'profile_owner_unavailable' USING ERRCODE = '42501';
  END IF;

  UPDATE public.preference_survey_responses AS current_row SET
    interests = p_interests, travel_style = p_travel_style, budget_range = p_budget_range,
    mobility_needs = p_mobility_needs, pet_friendly = p_pet_friendly,
    preferred_radius_km = p_preferred_radius_km, notes = p_notes, updated_at = clock_timestamp()
  WHERE current_row.user_id = v_user_id
    AND (current_row.interests, current_row.travel_style, current_row.budget_range, current_row.mobility_needs,
         current_row.pet_friendly, current_row.preferred_radius_km, current_row.notes)
      IS DISTINCT FROM
        (p_interests, p_travel_style, p_budget_range, p_mobility_needs, p_pet_friendly, p_preferred_radius_km, p_notes)
  RETURNING true INTO v_changed;
  RETURN coalesce(v_changed, false);
END;
$$;

-- Keep the existing first-submit lifecycle, but make its conflict update a no-op
-- when all submitted answers are unchanged. learned_affinity remains untouched.
CREATE OR REPLACE FUNCTION app_private.complete_preference_survey(
  p_user_id uuid, p_interests text[], p_budget_range text, p_mobility_needs text,
  p_pet_friendly boolean, p_preferred_radius_km integer, p_notes text, p_travel_style text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_travel_style NOT IN ('solo', 'couple', 'family', 'group') THEN RAISE EXCEPTION 'travel_style_invalid'; END IF;
  INSERT INTO public.preference_survey_responses
    (user_id, interests, travel_style, budget_range, mobility_needs, pet_friendly, preferred_radius_km, notes)
  VALUES (p_user_id, p_interests, p_travel_style, p_budget_range, p_mobility_needs, p_pet_friendly, p_preferred_radius_km, p_notes)
  ON CONFLICT (user_id) DO UPDATE SET interests=EXCLUDED.interests, travel_style=EXCLUDED.travel_style,
    budget_range=EXCLUDED.budget_range, mobility_needs=EXCLUDED.mobility_needs,
    pet_friendly=EXCLUDED.pet_friendly, preferred_radius_km=EXCLUDED.preferred_radius_km,
    notes=EXCLUDED.notes, updated_at=now()
  WHERE (preference_survey_responses.interests, preference_survey_responses.travel_style,
         preference_survey_responses.budget_range, preference_survey_responses.mobility_needs,
         preference_survey_responses.pet_friendly, preference_survey_responses.preferred_radius_km,
         preference_survey_responses.notes)
    IS DISTINCT FROM (EXCLUDED.interests, EXCLUDED.travel_style, EXCLUDED.budget_range,
                      EXCLUDED.mobility_needs, EXCLUDED.pet_friendly, EXCLUDED.preferred_radius_km, EXCLUDED.notes);
END;
$$;

REVOKE ALL ON FUNCTION public.save_personal_travel_details_if_changed(text, date, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_saved_traveller_if_changed(uuid, text, date, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_profile_identity_if_changed(text, text, text, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_preference_survey_if_changed(text[], text, text, text, boolean, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_personal_travel_details_if_changed(text, date, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_saved_traveller_if_changed(uuid, text, date, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_profile_identity_if_changed(text, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_preference_survey_if_changed(text[], text, text, text, boolean, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
