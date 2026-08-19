ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_preferred_locale_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_preferred_locale_check
  CHECK (preferred_locale IS NULL OR preferred_locale IN ('en', 'zh-CN', 'ms'));
