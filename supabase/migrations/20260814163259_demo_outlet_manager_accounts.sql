-- Phase 2 of vendor/outlet demo account restructure.
-- Assigns outlet-manager accounts to the 18 outlets of the 10 demo vendors.
-- Clean slate: outlet_managers and user_roles(role_id=4) both have 0 rows before this runs.
-- D6: chendul-keng-kwee keeps its pre-existing manager aaaaaaaa-0000-0000-0000-000000000004
-- (outlet.manager@demo.local) instead of getting a new computed account.

BEGIN;

-- 17 new outlet-manager accounts (excludes chendul-keng-kwee, whose manager already exists).
INSERT INTO public.users (id, email, full_name)
SELECT
  md5('outlet-manager:' || o.slug)::uuid,
  'manager.' || o.slug || '@demo.local',
  o.name || ' Manager'
FROM public.outlets o
WHERE o.slug IN (
  'chendul-gurney-plaza',
  'chendul-queensbay',
  'chendul-sunway-carnival',
  'ghee-hiang-beach',
  'ghee-hiang-burma',
  'ghee-hiang-macalister',
  'ghee-hiang-sunshine-central',
  'blue-mansion-leith',
  'op-penang-hill',
  'op-river-cruise-jetty',
  'op-river-cruise-tun-ali',
  'retail-kooya-hang-jebat',
  'retail-kooya-tukang-emas',
  'accom-hotel-puri',
  'guide-atlas-travel',
  'accom-heritage-hotel-cameron',
  'op-skyway-station'
)
ON CONFLICT (id) DO NOTHING;

-- outlet_managers: 17 computed accounts + 1 explicit row for chendul-keng-kwee.
INSERT INTO public.outlet_managers (user_id, outlet_id)
SELECT md5('outlet-manager:' || o.slug)::uuid, o.id
FROM public.outlets o
WHERE o.slug IN (
  'chendul-gurney-plaza',
  'chendul-queensbay',
  'chendul-sunway-carnival',
  'ghee-hiang-beach',
  'ghee-hiang-burma',
  'ghee-hiang-macalister',
  'ghee-hiang-sunshine-central',
  'blue-mansion-leith',
  'op-penang-hill',
  'op-river-cruise-jetty',
  'op-river-cruise-tun-ali',
  'retail-kooya-hang-jebat',
  'retail-kooya-tukang-emas',
  'accom-hotel-puri',
  'guide-atlas-travel',
  'accom-heritage-hotel-cameron',
  'op-skyway-station'
)
UNION ALL
SELECT 'aaaaaaaa-0000-0000-0000-000000000004'::uuid, o.id
FROM public.outlets o
WHERE o.slug = 'chendul-keng-kwee';

-- user_roles: role_id = 4 (outlet_manager) for all 18 outlets.
INSERT INTO public.user_roles (user_id, role_id, vendor_id, outlet_id)
SELECT md5('outlet-manager:' || o.slug)::uuid, 4, NULL::uuid, o.id
FROM public.outlets o
WHERE o.slug IN (
  'chendul-gurney-plaza',
  'chendul-queensbay',
  'chendul-sunway-carnival',
  'ghee-hiang-beach',
  'ghee-hiang-burma',
  'ghee-hiang-macalister',
  'ghee-hiang-sunshine-central',
  'blue-mansion-leith',
  'op-penang-hill',
  'op-river-cruise-jetty',
  'op-river-cruise-tun-ali',
  'retail-kooya-hang-jebat',
  'retail-kooya-tukang-emas',
  'accom-hotel-puri',
  'guide-atlas-travel',
  'accom-heritage-hotel-cameron',
  'op-skyway-station'
)
UNION ALL
SELECT 'aaaaaaaa-0000-0000-0000-000000000004'::uuid, 4, NULL::uuid, o.id
FROM public.outlets o
WHERE o.slug = 'chendul-keng-kwee';

DO $$
DECLARE
  v_outlet_managers_count int;
  v_user_roles_count int;
  v_bad_vendor_count int;
  v_keng_kwee_manager uuid;
BEGIN
  SELECT count(*) INTO v_outlet_managers_count FROM public.outlet_managers;
  IF v_outlet_managers_count <> 18 THEN
    RAISE EXCEPTION 'Expected 18 outlet_managers rows, found %', v_outlet_managers_count;
  END IF;

  SELECT count(*) INTO v_user_roles_count FROM public.user_roles WHERE role_id = 4;
  IF v_user_roles_count <> 18 THEN
    RAISE EXCEPTION 'Expected 18 user_roles rows with role_id = 4, found %', v_user_roles_count;
  END IF;

  SELECT count(*) INTO v_bad_vendor_count
  FROM public.outlet_managers om
  JOIN public.outlets o ON o.id = om.outlet_id
  JOIN public.vendors v ON v.id = o.vendor_id
  WHERE v.slug NOT IN (
    'penang-road-famous-teochew-chendul',
    'ghee-hiang',
    'cheong-fatt-tze-blue-mansion',
    'penang-hill-corporation',
    'melaka-river-cruise-vendor',
    'kooya-handicraft',
    'hotel-puri',
    'atlas-travel-services',
    'heritage-hotel-cameron-highlands',
    'highlands-skyway-operations'
  );
  IF v_bad_vendor_count <> 0 THEN
    RAISE EXCEPTION '% outlet_managers rows belong to outlets outside the 10 demo vendors', v_bad_vendor_count;
  END IF;

  SELECT om.user_id INTO v_keng_kwee_manager
  FROM public.outlet_managers om
  JOIN public.outlets o ON o.id = om.outlet_id
  WHERE o.slug = 'chendul-keng-kwee';

  IF v_keng_kwee_manager IS DISTINCT FROM 'aaaaaaaa-0000-0000-0000-000000000004'::uuid THEN
    RAISE EXCEPTION 'chendul-keng-kwee outlet manager is %, expected aaaaaaaa-0000-0000-0000-000000000004', v_keng_kwee_manager;
  END IF;
END $$;

COMMIT;
;
