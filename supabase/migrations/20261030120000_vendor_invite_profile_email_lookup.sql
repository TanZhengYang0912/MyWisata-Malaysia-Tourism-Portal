-- Compare normalized email addresses without exposing profile records to the invite flow.
CREATE OR REPLACE FUNCTION public.profile_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.users AS user_profile
     WHERE lower(btrim(user_profile.email)) = lower(btrim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.profile_email_exists(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_email_exists(text) TO service_role;

NOTIFY pgrst, 'reload schema';
