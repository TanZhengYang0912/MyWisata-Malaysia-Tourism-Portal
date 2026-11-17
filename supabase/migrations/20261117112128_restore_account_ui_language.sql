-- Restore the account's interface language after the English-only mail migration.
-- No Auth metadata, locale projection triggers or mail settings are changed.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferred_locale text;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_preferred_locale_check;
ALTER TABLE public.users ADD CONSTRAINT users_preferred_locale_check
  CHECK (preferred_locale IS NULL OR preferred_locale IN ('en', 'zh-CN', 'ms'));

DO $$
BEGIN
  IF to_regclass('app_private.account_ui_language_migration_backup') IS NOT NULL THEN
    UPDATE public.users AS account
    SET preferred_locale = backup.preferred_locale
    FROM app_private.account_ui_language_migration_backup AS backup
    WHERE account.id = backup.user_id AND account.preferred_locale IS NULL;
    DROP TABLE app_private.account_ui_language_migration_backup;
  END IF;
END;
$$;

CREATE FUNCTION app_private.get_my_preferred_locale()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT preferred_locale FROM public.users WHERE id = (SELECT auth.uid());
$$;

CREATE FUNCTION app_private.set_my_preferred_locale(p_locale text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('en', 'zh-CN', 'ms') THEN
    RAISE EXCEPTION 'unsupported_locale' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users SET preferred_locale = p_locale
  WHERE id = caller AND preferred_locale IS DISTINCT FROM p_locale;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = caller) THEN
    RAISE EXCEPTION 'profile_unavailable' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE FUNCTION public.get_my_preferred_locale()
RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.get_my_preferred_locale();
$$;

CREATE OR REPLACE FUNCTION public.set_my_preferred_locale(p_locale text)
RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.set_my_preferred_locale(p_locale);
$$;

REVOKE ALL ON FUNCTION app_private.get_my_preferred_locale(), app_private.set_my_preferred_locale(text),
  public.get_my_preferred_locale(), public.set_my_preferred_locale(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.get_my_preferred_locale(), app_private.set_my_preferred_locale(text),
  public.get_my_preferred_locale(), public.set_my_preferred_locale(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
