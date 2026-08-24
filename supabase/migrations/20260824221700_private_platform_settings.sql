-- Governance thresholds are server-only configuration. Browser clients must
-- use protected API routes instead of selecting this table directly.

DROP POLICY IF EXISTS settings_read ON public.platform_settings;
DROP POLICY IF EXISTS settings_super_admin_write ON public.platform_settings;

REVOKE ALL ON TABLE public.platform_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_settings TO service_role;
