-- No-op and changed saves run under an owner JWT; every fixture rolls back.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SELECT set_config('profile_noop.owner', gen_random_uuid()::text, true);
INSERT INTO public.users(id,email,full_name,status,city,country,country_code,city_source)
VALUES (current_setting('profile_noop.owner')::uuid,
  'profile-noop-'||current_setting('profile_noop.owner')||'@example.invalid',
  'Profile Fixture','active','Kuala Lumpur','Malaysia','MY','manual');
INSERT INTO public.profile_personal_details(user_id,legal_name,nationality_code)
VALUES(current_setting('profile_noop.owner')::uuid,'Fixture Owner','MY');
INSERT INTO public.saved_travellers(user_id,legal_name,nationality_code,contact_phone,relationship)
VALUES(current_setting('profile_noop.owner')::uuid,'Fixture Traveller','MY','+60123456789','friend');
INSERT INTO public.preference_survey_responses(user_id,interests,travel_style,budget_range,mobility_needs,pet_friendly,preferred_radius_km,notes,learned_affinity)
VALUES(current_setting('profile_noop.owner')::uuid,ARRAY['food'],'solo','mid_range','none',false,20,NULL,'{"food":2}'::jsonb);
SELECT set_config('request.jwt.claim.sub',current_setting('profile_noop.owner'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('profile_noop.owner'),'role','authenticated','is_anonymous',false)::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_owner uuid := auth.uid();
  v_traveller uuid;
  v_updated timestamptz;
  v_changed boolean;
  v_tier text;
BEGIN
  SELECT id INTO v_traveller FROM public.saved_travellers WHERE user_id=v_owner;
  SELECT updated_at INTO v_updated FROM public.profile_personal_details WHERE user_id=v_owner;
  IF public.save_personal_travel_details_if_changed('Fixture Owner',NULL,NULL,'MY',NULL,NULL,NULL) THEN
    RAISE EXCEPTION 'same personal details reported as changed';
  END IF;
  IF (SELECT updated_at FROM public.profile_personal_details WHERE user_id=v_owner) IS DISTINCT FROM v_updated THEN
    RAISE EXCEPTION 'no-op personal save touched updated_at';
  END IF;
  IF NOT public.save_personal_travel_details_if_changed('Fixture Owner',NULL,'female','MY',NULL,NULL,NULL) THEN
    RAISE EXCEPTION 'changed personal details were not saved';
  END IF;

  SELECT changed INTO v_changed FROM public.save_saved_traveller_if_changed(
    v_traveller,'Fixture Traveller',NULL,NULL,'MY',NULL,NULL,NULL,'+60123456789','friend');
  IF v_changed THEN RAISE EXCEPTION 'same traveller reported as changed'; END IF;
  SELECT changed INTO v_changed FROM public.save_saved_traveller_if_changed(
    v_traveller,'Fixture Traveller',NULL,NULL,'MY',NULL,NULL,NULL,'+60123456780','friend');
  IF NOT v_changed THEN RAISE EXCEPTION 'changed traveller was not saved'; END IF;

  SELECT changed,tier INTO v_changed,v_tier FROM public.save_profile_identity_if_changed(
    'Profile Fixture','Kuala Lumpur','Malaysia',NULL,'MY','manual');
  IF v_changed THEN RAISE EXCEPTION 'same identity reported as changed'; END IF;
  SELECT changed INTO v_changed FROM public.save_profile_identity_if_changed(
    'Profile Fixture Updated','Kuala Lumpur','Malaysia',NULL,'MY','manual');
  IF NOT v_changed THEN RAISE EXCEPTION 'changed identity was not saved'; END IF;

  SELECT public.save_preference_survey_if_changed(
    ARRAY['food'],'solo','mid_range','none',false,20,NULL) INTO v_changed;
  IF v_changed THEN RAISE EXCEPTION 'same survey reported as changed'; END IF;
  SELECT public.save_preference_survey_if_changed(
    ARRAY['food'],'family','mid_range','none',false,20,NULL) INTO v_changed;
  IF NOT v_changed THEN RAISE EXCEPTION 'changed survey was not saved'; END IF;
  IF (SELECT learned_affinity FROM public.preference_survey_responses WHERE user_id=v_owner) <> '{"food":2}'::jsonb THEN
    RAISE EXCEPTION 'survey update changed learned affinity';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
