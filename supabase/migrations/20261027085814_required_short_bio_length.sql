-- New or edited bios require 3-30 characters. Preserve previously completed
-- profiles with an accepted 31-200 character bio; never truncate saved content.
-- CREATE OR REPLACE preserves the existing function ACLs and public RPC wrapper.

CREATE OR REPLACE FUNCTION public.profile_completion_eligible(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.users AS user_row
     WHERE user_row.id = p_user_id
       AND char_length(btrim(COALESCE(user_row.full_name, ''))) >= 2
       AND btrim(COALESCE(user_row.city, '')) <> ''
       AND btrim(COALESCE(user_row.country, '')) <> ''
       AND btrim(COALESCE(user_row.avatar_url, '')) <> ''
       AND lower(regexp_replace(
         split_part(btrim(COALESCE(user_row.avatar_url, '')), '?', 1),
         '^.*/',
         ''
       )) NOT IN (
         'default-avatar.png',
         'default-avatar.jpg',
         'default-avatar.jpeg',
         'default-avatar.webp',
         'default-avatar.svg'
       )
       AND (
         char_length(btrim(COALESCE(user_row.bio, ''))) BETWEEN 3 AND 30
         OR (
           user_row.profile_completed_at IS NOT NULL
           AND char_length(btrim(COALESCE(user_row.bio, ''))) BETWEEN 31 AND 200
         )
       )
       AND EXISTS (
         SELECT 1
           FROM public.preference_survey_responses AS response
          WHERE response.user_id = p_user_id
            AND COALESCE(cardinality(response.interests), 0) > 0
       )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.promote_to_profile_complete(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.users%ROWTYPE;
  v_avatar_name TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT *
    INTO v_row
    FROM public.users
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;

  IF char_length(btrim(COALESCE(v_row.full_name, ''))) < 2 THEN
    RAISE EXCEPTION 'profile_incomplete: full_name required';
  END IF;
  IF btrim(COALESCE(v_row.city, '')) = '' THEN
    RAISE EXCEPTION 'profile_incomplete: city required';
  END IF;
  IF btrim(COALESCE(v_row.country, '')) = '' THEN
    RAISE EXCEPTION 'profile_incomplete: country required';
  END IF;
  v_avatar_name := lower(regexp_replace(
    split_part(btrim(COALESCE(v_row.avatar_url, '')), '?', 1),
    '^.*/',
    ''
  ));
  IF btrim(COALESCE(v_row.avatar_url, '')) = '' THEN
    RAISE EXCEPTION 'profile_incomplete: avatar_url required';
  END IF;
  IF v_avatar_name IN (
    'default-avatar.png',
    'default-avatar.jpg',
    'default-avatar.jpeg',
    'default-avatar.webp',
    'default-avatar.svg'
  ) THEN
    RAISE EXCEPTION 'profile_incomplete: uploaded avatar required';
  END IF;
  IF NOT (
    char_length(btrim(COALESCE(v_row.bio, ''))) BETWEEN 3 AND 30
    OR (
      v_row.profile_completed_at IS NOT NULL
      AND char_length(btrim(COALESCE(v_row.bio, ''))) BETWEEN 31 AND 200
    )
  ) THEN
    RAISE EXCEPTION 'profile_incomplete: moderated bio required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.preference_survey_responses AS response
     WHERE response.user_id = p_user_id
       AND COALESCE(cardinality(response.interests), 0) > 0
  ) THEN
    RAISE EXCEPTION 'profile_incomplete: preference survey required';
  END IF;

  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users
     SET profile_completed_at = COALESCE(profile_completed_at, now()),
         updated_at = now()
   WHERE id = p_user_id;

  PERFORM public.recompute_compatibility_tier(p_user_id);
END;
$$;
