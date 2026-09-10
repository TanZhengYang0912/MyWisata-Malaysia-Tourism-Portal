-- Kuala Lumpur admission showcase — seed data.
-- See Docs/plans/2026-09-10-0211-kl-admission-showcase-and-ticket-ui.md Task 6.
--
-- PLACE IDENTITIES ARE REAL. VENDORS AND ALL COMMERCIAL DATA ARE NOT.
--
-- The places (Petronas Twin Towers, Jalan Alor, Central Market, Bukit Nanas
-- Forest Reserve) are real Kuala Lumpur locations, seeded earlier from
-- OpenStreetMap — © OpenStreetMap contributors, ODbL v1.0
-- (https://www.openstreetmap.org/copyright).
--
-- The VENDORS below are DEMO VENDORS invented for an academic project.
-- "Kuala Lumpur City Guides", "Heritage Walk KL", "KL Food Tours",
-- "Jalan Alor Night Eats" and "Forest Canopy KL" are not real companies and
-- have no OpenStreetMap source. "Petronas Twin Towers" names the real operator
-- of that landmark, but the vendor account, outlet, prices, fare tiers and
-- booking slots attributed to it here are fabricated and do not describe that
-- organisation's actual catalogue, pricing or commercial arrangements. No
-- business named here has any relationship with this platform.
--
-- All ids are deterministic via md5('kuala-lumpur:<type>:<key>')::uuid and every
-- INSERT uses ON CONFLICT DO NOTHING, so this file is safe to re-run.

BEGIN;

DO $$
DECLARE
  v_petronas uuid := md5('kuala-lumpur:vendor:petronas-twin-towers-vendor')::uuid;
  v_city uuid := md5('kuala-lumpur:vendor:kuala-lumpur-city-guides')::uuid;
  v_heritage uuid := md5('kuala-lumpur:vendor:heritage-walk-kl')::uuid;
  v_food uuid := md5('kuala-lumpur:vendor:kl-food-tours')::uuid;
  v_night uuid := md5('kuala-lumpur:vendor:jalan-alor-night-eats')::uuid;
  v_canopy uuid := md5('kuala-lumpur:vendor:forest-canopy-kl')::uuid;

  u_petronas uuid := md5('kuala-lumpur:user:petronas-twin-towers-vendor')::uuid;
  u_city uuid := md5('kuala-lumpur:user:kuala-lumpur-city-guides')::uuid;
  u_heritage uuid := md5('kuala-lumpur:user:heritage-walk-kl')::uuid;
  u_food uuid := md5('kuala-lumpur:user:kl-food-tours')::uuid;
  u_night uuid := md5('kuala-lumpur:user:jalan-alor-night-eats')::uuid;
  u_canopy uuid := md5('kuala-lumpur:user:forest-canopy-kl')::uuid;

  o_petronas uuid := md5('kuala-lumpur:outlet:petronas-twin-towers-counter')::uuid;
  o_city uuid := md5('kuala-lumpur:outlet:kuala-lumpur-city-guides-office')::uuid;
  o_heritage uuid := md5('kuala-lumpur:outlet:heritage-walk-kl-office')::uuid;
  o_food uuid := md5('kuala-lumpur:outlet:kl-food-tours-office')::uuid;
  o_night uuid := md5('kuala-lumpur:outlet:jalan-alor-night-eats-office')::uuid;
  o_canopy uuid := md5('kuala-lumpur:outlet:forest-canopy-kl-office')::uuid;

  p_skybridge uuid := md5('kuala-lumpur:product:skybridge-observation-deck')::uuid;
  p_towers_tour uuid := md5('kuala-lumpur:product:twin-towers-city-centre-walking-tour')::uuid;
  p_market_craft uuid := md5('kuala-lumpur:product:central-market-craft-culture-walk')::uuid;
  p_market_heritage uuid := md5('kuala-lumpur:product:old-kl-market-heritage-walk')::uuid;
  p_alor_heritage uuid := md5('kuala-lumpur:product:jalan-alor-heritage-food-walk')::uuid;
  p_alor_crawl uuid := md5('kuala-lumpur:product:jalan-alor-street-food-crawl')::uuid;
  p_alor_hawker uuid := md5('kuala-lumpur:product:late-night-hawker-tour')::uuid;
  p_canopy_trek uuid := md5('kuala-lumpur:product:bukit-nanas-canopy-walk-guided-trek')::uuid;

  c_activity uuid;
  v_role_vendor_owner int;
BEGIN
  SELECT id INTO c_activity FROM public.categories WHERE slug = 'activity';
  IF c_activity IS NULL THEN
    RAISE EXCEPTION 'activity category is missing';
  END IF;

  SELECT id INTO v_role_vendor_owner FROM public.roles WHERE name = 'vendor_owner';
  IF v_role_vendor_owner IS NULL THEN
    RAISE EXCEPTION 'vendor_owner role is missing';
  END IF;

  INSERT INTO public.users (id, email, full_name)
  VALUES
    (u_petronas, 'owner.petronas-twin-towers-vendor@demo.local', 'Petronas Twin Towers Owner'),
    (u_city, 'owner.kuala-lumpur-city-guides@demo.local', 'Kuala Lumpur City Guides Owner'),
    (u_heritage, 'owner.heritage-walk-kl@demo.local', 'Heritage Walk KL Owner'),
    (u_food, 'owner.kl-food-tours@demo.local', 'KL Food Tours Owner'),
    (u_night, 'owner.jalan-alor-night-eats@demo.local', 'Jalan Alor Night Eats Owner'),
    (u_canopy, 'owner.forest-canopy-kl@demo.local', 'Forest Canopy KL Owner')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.vendors (id, owner_id, name, slug, description, business_type, status, approved_at)
  VALUES
    (v_petronas, u_petronas, 'Petronas Twin Towers', 'petronas-twin-towers-vendor', 'Demo ticket seller for the Kuala Lumpur admission showcase.', 'attraction', 'approved', now()),
    (v_city, u_city, 'Kuala Lumpur City Guides', 'kuala-lumpur-city-guides', 'Demo city walking-tour seller for the Kuala Lumpur admission showcase.', 'activity', 'approved', now()),
    (v_heritage, u_heritage, 'Heritage Walk KL', 'heritage-walk-kl', 'Demo heritage walking-tour seller for the Kuala Lumpur admission showcase.', 'activity', 'approved', now()),
    (v_food, u_food, 'KL Food Tours', 'kl-food-tours', 'Demo food-tour seller for the Kuala Lumpur admission showcase.', 'activity', 'approved', now()),
    (v_night, u_night, 'Jalan Alor Night Eats', 'jalan-alor-night-eats', 'Demo night-food-tour seller for the Kuala Lumpur admission showcase.', 'activity', 'approved', now()),
    (v_canopy, u_canopy, 'Forest Canopy KL', 'forest-canopy-kl', 'Demo guided-trek seller for the Kuala Lumpur admission showcase.', 'activity', 'approved', now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id, vendor_id, outlet_id)
  VALUES
    (u_petronas, v_role_vendor_owner, v_petronas, NULL),
    (u_city, v_role_vendor_owner, v_city, NULL),
    (u_heritage, v_role_vendor_owner, v_heritage, NULL),
    (u_food, v_role_vendor_owner, v_food, NULL),
    (u_night, v_role_vendor_owner, v_night, NULL),
    (u_canopy, v_role_vendor_owner, v_canopy, NULL)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_petronas, v_petronas, 'Petronas Twin Towers — Ticket Counter', 'petronas-twin-towers-counter', 'Level 3, Suria KLCC, Jalan Ampang', 'Kuala Lumpur', 'Kuala Lumpur', 3.1579, 101.7116),
    (o_city, v_city, 'Kuala Lumpur City Guides', 'kuala-lumpur-city-guides-office', 'Jalan Ampang', 'Kuala Lumpur', 'Kuala Lumpur', 3.1570, 101.7120),
    (o_heritage, v_heritage, 'Heritage Walk KL', 'heritage-walk-kl-office', 'Jalan Hang Kasturi', 'Kuala Lumpur', 'Kuala Lumpur', 3.1457, 101.6958),
    (o_food, v_food, 'KL Food Tours', 'kl-food-tours-office', 'Jalan Alor', 'Kuala Lumpur', 'Kuala Lumpur', 3.1448, 101.7004),
    (o_night, v_night, 'Jalan Alor Night Eats', 'jalan-alor-night-eats-office', 'Jalan Alor', 'Kuala Lumpur', 'Kuala Lumpur', 3.1450, 101.7008),
    (o_canopy, v_canopy, 'Forest Canopy KL', 'forest-canopy-kl-office', 'Jalan Raja Chulan', 'Kuala Lumpur', 'Kuala Lumpur', 3.1528, 101.7038)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.products (
    id, vendor_id, outlet_id, category_id, name, slug, description,
    product_type, requires_booking, base_price, status, review_status
  )
  VALUES
    (p_skybridge, v_petronas, o_petronas, c_activity, 'Skybridge & Observation Deck', 'skybridge-observation-deck', 'Demo admission ticket for the Petronas Twin Towers showcase.', 'activity', true, 80.00, 'active', 'approved'),
    (p_towers_tour, v_city, o_city, c_activity, 'Twin Towers & City Centre Walking Tour', 'twin-towers-city-centre-walking-tour', 'Demo guided walk around the Twin Towers and city centre.', 'experience', true, 120.00, 'active', 'approved'),
    (p_market_craft, v_city, o_city, c_activity, 'Central Market Craft & Culture Walk', 'central-market-craft-culture-walk', 'Demo guided walk through Central Market craft and culture.', 'experience', true, 65.00, 'active', 'approved'),
    (p_market_heritage, v_heritage, o_heritage, c_activity, 'Old KL Market Heritage Walk', 'old-kl-market-heritage-walk', 'Demo heritage walk through the old market district.', 'experience', true, 80.00, 'active', 'approved'),
    (p_alor_heritage, v_heritage, o_heritage, c_activity, 'Jalan Alor Heritage & Food Walk', 'jalan-alor-heritage-food-walk', 'Demo heritage and food walk on Jalan Alor.', 'experience', true, 110.00, 'active', 'approved'),
    (p_alor_crawl, v_food, o_food, c_activity, 'Jalan Alor Street Food Crawl', 'jalan-alor-street-food-crawl', 'Demo guided crawl through Jalan Alor street food.', 'experience', true, 150.00, 'active', 'approved'),
    (p_alor_hawker, v_night, o_night, c_activity, 'Late Night Hawker Tour', 'late-night-hawker-tour', 'Demo late-night hawker-food tour on Jalan Alor.', 'experience', true, 95.00, 'active', 'approved'),
    (p_canopy_trek, v_canopy, o_canopy, c_activity, 'Bukit Nanas Canopy Walk Guided Trek', 'bukit-nanas-canopy-walk-guided-trek', 'Demo guided trek through Bukit Nanas Forest Reserve.', 'experience', true, 55.00, 'active', 'approved')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.product_places (product_id, place_id, relation_type)
  SELECT links.product_id, places.id, links.relation_type
  FROM (VALUES
    (p_skybridge, 'petronas-twin-towers', 'admission'),
    (p_towers_tour, 'petronas-twin-towers', 'guide_service'),
    (p_market_craft, 'central-market-kuala-lumpur', 'guide_service'),
    (p_market_heritage, 'central-market-kuala-lumpur', 'guide_service'),
    (p_alor_heritage, 'jalan-alor', 'guide_service'),
    (p_alor_crawl, 'jalan-alor', 'guide_service'),
    (p_alor_hawker, 'jalan-alor', 'guide_service'),
    (p_canopy_trek, 'bukit-nanas-forest-reserve', 'guide_service')
  ) AS links(product_id, place_slug, relation_type)
  JOIN public.places ON places.slug = links.place_slug
  ON CONFLICT DO NOTHING;

  INSERT INTO public.product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('kuala-lumpur:variant:skybridge-adult-mykad')::uuid, p_skybridge, 'Adult (MyKad)', 0, true),
    (md5('kuala-lumpur:variant:skybridge-child-mykad')::uuid, p_skybridge, 'Child (MyKad)', -47, false),
    (md5('kuala-lumpur:variant:skybridge-adult-foreign')::uuid, p_skybridge, 'Adult (non-Malaysian)', 18, false),
    (md5('kuala-lumpur:variant:skybridge-child-foreign')::uuid, p_skybridge, 'Child (non-Malaysian)', -35, false),
    (md5('kuala-lumpur:variant:towers-tour-standard')::uuid, p_towers_tour, 'Standard', 0, true),
    (md5('kuala-lumpur:variant:market-craft-standard')::uuid, p_market_craft, 'Standard', 0, true),
    (md5('kuala-lumpur:variant:market-heritage-standard')::uuid, p_market_heritage, 'Standard', 0, true),
    (md5('kuala-lumpur:variant:alor-heritage-standard')::uuid, p_alor_heritage, 'Standard', 0, true),
    (md5('kuala-lumpur:variant:alor-crawl-standard')::uuid, p_alor_crawl, 'Standard', 0, true),
    (md5('kuala-lumpur:variant:alor-hawker-standard')::uuid, p_alor_hawker, 'Standard', 0, true),
    (md5('kuala-lumpur:variant:canopy-trek-standard')::uuid, p_canopy_trek, 'Standard', 0, true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.booking_slots (product_id, outlet_id, starts_at, ends_at, capacity, booked, status)
  SELECT pr.id,
         pr.outlet_id,
         (slot.day + interval '10 hours') AT TIME ZONE 'Asia/Kuala_Lumpur',
         (slot.day + interval '12 hours') AT TIME ZONE 'Asia/Kuala_Lumpur',
         20, 0, 'available'
  FROM public.products pr
  CROSS JOIN generate_series(
    ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date + 1)::timestamp,
    ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date + 14)::timestamp,
    interval '1 day'
  ) AS slot(day)
  WHERE pr.id IN (p_skybridge, p_towers_tour, p_market_craft, p_market_heritage,
                  p_alor_heritage, p_alor_crawl, p_alor_hawker, p_canopy_trek)
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_slots bs
      WHERE bs.product_id = pr.id
        AND bs.starts_at = (slot.day + interval '10 hours') AT TIME ZONE 'Asia/Kuala_Lumpur'
    );

  UPDATE public.places
     SET managed_by_vendor_id = v_petronas,
         entry_fee = 80.00
   WHERE slug = 'petronas-twin-towers';
END $$;

DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    md5('kuala-lumpur:product:skybridge-observation-deck')::uuid,
    md5('kuala-lumpur:product:twin-towers-city-centre-walking-tour')::uuid,
    md5('kuala-lumpur:product:central-market-craft-culture-walk')::uuid,
    md5('kuala-lumpur:product:old-kl-market-heritage-walk')::uuid,
    md5('kuala-lumpur:product:jalan-alor-heritage-food-walk')::uuid,
    md5('kuala-lumpur:product:jalan-alor-street-food-crawl')::uuid,
    md5('kuala-lumpur:product:late-night-hawker-tour')::uuid,
    md5('kuala-lumpur:product:bukit-nanas-canopy-walk-guided-trek')::uuid
  ];
  v_n integer;
  v_fee numeric;
BEGIN
  SELECT count(*) INTO v_n FROM public.product_places
  WHERE product_id = ANY (v_ids) AND relation_type = 'admission';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'expected 1 seeded admission link, found %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.product_places
  WHERE product_id = ANY (v_ids) AND relation_type = 'guide_service';
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'expected 7 seeded guide_service links, found %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.products pr
  WHERE pr.id = ANY (v_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.product_variants pv
      WHERE pv.product_id = pr.id AND pv.is_active
    );
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% seeded products have no active variant', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.products pr
  WHERE pr.id = ANY (v_ids) AND pr.outlet_id IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% seeded products have no outlet', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.products pr
  WHERE pr.id = ANY (v_ids) AND pr.requires_booking
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_slots bs
      WHERE bs.product_id = pr.id AND bs.starts_at > now()
    );
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% bookable seeded products have no future slot', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.product_variants
  WHERE product_id = md5('kuala-lumpur:product:skybridge-observation-deck')::uuid;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'expected 4 Skybridge variants, found %', v_n;
  END IF;

  SELECT entry_fee INTO v_fee FROM public.places WHERE slug = 'petronas-twin-towers';
  IF v_fee <> 80.00 THEN
    RAISE EXCEPTION 'expected Petronas entry_fee 80.00, found %', v_fee;
  END IF;
END $$;

COMMIT;
