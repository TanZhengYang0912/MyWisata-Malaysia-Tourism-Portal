-- Restore the authenticated self-service locale RPC after live schema drift.
CREATE OR REPLACE FUNCTION public.set_my_preferred_locale(p_locale text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_locale IS NULL OR p_locale NOT IN ('en', 'zh-CN', 'ms') THEN
    RAISE EXCEPTION 'unsupported_locale' USING ERRCODE = '22023';
  END IF;

  -- Keep the established Auth-before-profile lock order to avoid deadlocks.
  PERFORM 1 FROM auth.users WHERE id = caller FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_unavailable' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.users SET preferred_locale = p_locale WHERE id = caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_unavailable' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_preferred_locale(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_my_preferred_locale(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
