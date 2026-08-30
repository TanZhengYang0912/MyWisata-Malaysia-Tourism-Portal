-- Give every vendor its own owner account.
--
-- 170 vendors currently share just 3 owner accounts (a side effect of the
-- state seed migrations cycling ownership across them), breaking the app's
-- one-vendor-per-owner invariant and making the vendor dashboard's
-- `.limit(1)` owner lookup non-deterministic (lib/vendor-dashboard.ts:128).
--
-- This migration gives all 170 vendors a distinct owner row, except
-- Penang Road Famous Teochew Chendul, which is explicitly pinned to
-- vendor.owner@demo.local (aaaaaaaa-0000-0000-0000-000000000003) because
-- several e2e/smoke scripts already log in as that account.
--
-- Owner ids are deterministic (md5('vendor-owner:' || slug)::uuid) so this
-- migration is idempotent and safe to replay after `supabase db reset`.

BEGIN;

-- 1. One public.users row per vendor (excluding Chendul, which keeps its
--    existing owner). ON CONFLICT DO NOTHING keeps this replay-safe.
INSERT INTO public.users (id, email, full_name)
SELECT
  md5('vendor-owner:' || v.slug)::uuid,
  'owner.' || v.slug || '@demo.local',
  v.name || ' Owner'
FROM public.vendors v
WHERE v.slug <> 'penang-road-famous-teochew-chendul'
ON CONFLICT (id) DO NOTHING;

-- 2. Point every vendor (except Chendul) at its new dedicated owner.
UPDATE public.vendors
SET owner_id = md5('vendor-owner:' || slug)::uuid
WHERE slug <> 'penang-road-famous-teochew-chendul';

-- 2b. Chendul is explicitly pinned to the pre-existing vendor.owner@demo.local
--     account. Its current seeded owner_id is aaaaaaaa-...-010 (the seed
--     migrations cycle ownership across 3 shared accounts), so this must be
--     an explicit assignment, not a no-op skip.
UPDATE public.vendors
SET owner_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
WHERE slug = 'penang-road-famous-teochew-chendul';

-- 3. Rebuild the vendor_owner (role_id = 3) role assignments from scratch —
--    the old rows point at the 3 shared owners and no longer match owner_id.
DELETE FROM public.user_roles WHERE role_id = 3;

INSERT INTO public.user_roles (user_id, role_id, vendor_id, outlet_id)
SELECT v.owner_id, 3, v.id, NULL
FROM public.vendors v;

-- 4. Verify the invariants before committing. Any failure raises and aborts
--    the transaction, leaving the database untouched.
DO $$
DECLARE
  vendor_count integer;
  distinct_owner_count integer;
  vendor_owner_role_count integer;
  mismatched_vendors integer;
  chendul_owner uuid;
BEGIN
  SELECT count(*), count(DISTINCT owner_id)
    INTO vendor_count, distinct_owner_count
    FROM public.vendors;

  IF vendor_count <> distinct_owner_count THEN
    RAISE EXCEPTION
      'expected every vendor to have a distinct owner, got % vendors / % distinct owners',
      vendor_count, distinct_owner_count;
  END IF;

  SELECT count(*) INTO vendor_owner_role_count
    FROM public.user_roles WHERE role_id = 3;

  IF vendor_owner_role_count <> 170 THEN
    RAISE EXCEPTION
      'expected 170 vendor_owner user_roles rows, got %', vendor_owner_role_count;
  END IF;

  SELECT count(*) INTO mismatched_vendors
    FROM public.vendors v
    LEFT JOIN public.user_roles ur
      ON ur.role_id = 3 AND ur.vendor_id = v.id AND ur.user_id = v.owner_id
    WHERE ur.id IS NULL;

  IF mismatched_vendors <> 0 THEN
    RAISE EXCEPTION
      '% vendors are missing a matching vendor_owner user_roles row', mismatched_vendors;
  END IF;

  SELECT owner_id INTO chendul_owner
    FROM public.vendors WHERE slug = 'penang-road-famous-teochew-chendul';

  IF chendul_owner <> 'aaaaaaaa-0000-0000-0000-000000000003'::uuid THEN
    RAISE EXCEPTION
      'chendul owner_id changed unexpectedly to %', chendul_owner;
  END IF;
END $$;

COMMIT;
