-- This runs immediately before the legacy account locale and mail migration.
-- The later UI migration restores these values and removes the backup table.
CREATE TABLE IF NOT EXISTS app_private.account_ui_language_migration_backup (
  user_id uuid PRIMARY KEY,
  preferred_locale text NOT NULL CHECK (preferred_locale IN ('en', 'zh-CN', 'ms'))
);
ALTER TABLE app_private.account_ui_language_migration_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.account_ui_language_migration_backup FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferred_locale'
  ) THEN
    INSERT INTO app_private.account_ui_language_migration_backup (user_id, preferred_locale)
    SELECT id, preferred_locale FROM public.users WHERE preferred_locale IN ('en', 'zh-CN', 'ms')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END;
$$;
