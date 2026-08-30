-- Give every remaining outlet its own manager account.
--
-- 20260815011000_demo_outlet_manager_accounts.sql assigned managers to the
-- 18 outlets belonging to the 10 demo vendors with real logins. The other
-- 161 outlets (belonging to the other 160 vendors) had no manager account
-- at all. This mirrors 20260815010000_per_vendor_owner_accounts.sql's
-- "every vendor gets an owner" pattern for outlets: deterministic id so
-- this is idempotent and safe to replay, data-only (no auth.users row) so
-- these stay invisible in the demo-account picker's real-login filter.
--
-- ON CONFLICT targets below match this live project's actual constraints
-- (outlet_managers_outlet_id_user_id_key, a composite (outlet_id, user_id)
-- unique; user_roles_user_id_role_id_vendor_id_outlet_id_key, the full
-- 4-column composite) rather than the narrower single-column constraints
-- the repo's 009_outlet_manager_one_to_one.sql defines — that migration is
-- not in this project's applied migration history (confirmed via
-- list_migrations), so those narrower constraints don't exist here.

BEGIN;

CREATE TEMP TABLE outlets_needing_manager AS
SELECT o.id AS outlet_id, o.slug, o.name
FROM public.outlets o
LEFT JOIN public.outlet_managers om ON om.outlet_id = o.id
WHERE om.outlet_id IS NULL;

INSERT INTO public.users (id, email, full_name)
SELECT md5('outlet-manager:' || slug)::uuid, 'manager.' || slug || '@demo.local', name || ' Manager'
FROM outlets_needing_manager
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.outlet_managers (user_id, outlet_id)
SELECT md5('outlet-manager:' || slug)::uuid, outlet_id
FROM outlets_needing_manager
ON CONFLICT (outlet_id, user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_id, vendor_id, outlet_id)
SELECT md5('outlet-manager:' || slug)::uuid, 4, NULL::uuid, outlet_id
FROM outlets_needing_manager
ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

DO $$
DECLARE
  total_outlets integer;
  total_managers integer;
  total_role_rows integer;
  orphan_count integer;
BEGIN
  SELECT count(*) INTO total_outlets FROM public.outlets;
  SELECT count(*) INTO total_managers FROM public.outlet_managers;
  SELECT count(*) INTO total_role_rows FROM public.user_roles WHERE role_id = 4;

  IF total_managers <> total_outlets THEN
    RAISE EXCEPTION 'expected % outlet_managers rows (one per outlet), got %', total_outlets, total_managers;
  END IF;

  IF total_role_rows <> total_outlets THEN
    RAISE EXCEPTION 'expected % user_roles rows with role_id=4, got %', total_outlets, total_role_rows;
  END IF;

  SELECT count(*) INTO orphan_count
  FROM public.outlets o
  LEFT JOIN public.outlet_managers om ON om.outlet_id = o.id
  WHERE om.outlet_id IS NULL;

  IF orphan_count <> 0 THEN
    RAISE EXCEPTION '% outlets still have no manager after this migration', orphan_count;
  END IF;
END $$;

DROP TABLE outlets_needing_manager;

COMMIT;
