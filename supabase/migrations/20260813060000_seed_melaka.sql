-- Melaka place model — seed data.
-- See docs/plans/2026-08-13-0048-melaka-place-seed-and-imagery.md
--
-- ─────────────────────────────────────────────────────────────────────
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real Melaka
-- businesses sourced from OpenStreetMap —
-- © OpenStreetMap contributors, ODbL v1.0
-- (https://www.openstreetmap.org/copyright).
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, order items, bookings,
-- reviews, ratings, revenue and wallet balances in section 8 are randomly
-- generated demo content for an academic project. They do not describe,
-- and must not be read as describing, the real businesses named here.
-- No business listed has any relationship with this platform.
--
-- NO EXCEPTIONS: every vendor, outlet, name, address and coordinate below
-- is a real Melaka business sourced from OpenStreetMap. The guide-service
-- products belong to Atlas Travel Services, a real licensed travel agency
-- (shop=travel_agency, 2.1951797/102.2480239); their itineraries and prices
-- are plausible demo content, not that agency's actual catalogue. Their
-- outlet_id IS NULL is deliberate — see plan §2.4.
-- ─────────────────────────────────────────────────────────────────────
--
-- All catalogue-level IDs are deterministic via md5('melaka:<type>:<key>')::uuid,
-- so this file is safe to re-run (every catalogue INSERT uses ON CONFLICT DO
-- NOTHING). The order/review/wallet replay in section 8 is NOT idempotent —
-- it is guarded by a one-time ORD-MK-SEED marker check instead.
--
-- Divergence from the plan as written:
--   - Three POI coordinates (the-stadthuys, menara-taming-sari,
--     baba-nyonya-museum) were corrected against Overpass ground truth during
--     Phase 1 Step 2 (2026-08-14) — the plan's original guesses were off by
--     104m/329m/82m respectively. §3.1 and §3.3 in the plan reflect the fix.
--   - category_id is resolved once via c_food/c_activity/c_accommodation/
--     c_retail variables (Penang reseed's pattern), not per-row inline SELECT
--     as the plan's Step 9 example shows — same effect, fewer subqueries.

BEGIN;

DO $$
DECLARE
  -- places
  v_melaka uuid := md5('melaka:place:melaka')::uuid;
  v_bandar_hilir uuid := md5('melaka:place:bandar-hilir')::uuid;
  v_melaka_river uuid := md5('melaka:place:melaka-river')::uuid;
  v_klebang uuid := md5('melaka:place:klebang')::uuid;
  v_ayer_keroh uuid := md5('melaka:place:ayer-keroh')::uuid;

  v_p_famosa uuid := md5('melaka:place:a-famosa')::uuid;
  v_p_st_paul uuid := md5('melaka:place:st-pauls-church')::uuid;
  v_p_christ_church uuid := md5('melaka:place:christ-church-melaka')::uuid;
  v_p_stadthuys uuid := md5('melaka:place:the-stadthuys')::uuid;
  v_p_jonker uuid := md5('melaka:place:jonker-street')::uuid;
  v_p_taming_sari uuid := md5('melaka:place:menara-taming-sari')::uuid;
  v_p_river_cruise uuid := md5('melaka:place:melaka-river-cruise')::uuid;
  v_p_morten uuid := md5('melaka:place:kampung-morten')::uuid;
  v_p_baba_nyonya uuid := md5('melaka:place:baba-nyonya-museum')::uuid;
  v_p_straits_mosque uuid := md5('melaka:place:melaka-straits-mosque')::uuid;
  v_p_klebang_beach uuid := md5('melaka:place:klebang-beach')::uuid;
  v_p_zoo uuid := md5('melaka:place:melaka-zoo')::uuid;

  -- vendors (all real — see plan D5 / §2.4)
  v_v_capitol uuid := md5('melaka:vendor:food-capitol-satay-celup')::uuid;
  v_v_famosa_crb uuid := md5('melaka:vendor:food-famosa-chicken-rice-ball')::uuid;
  v_v_geographer uuid := md5('melaka:vendor:food-geographer-cafe')::uuid;
  v_v_jonker88 uuid := md5('melaka:vendor:food-jonker-88-heritage')::uuid;
  v_v_pak_putra uuid := md5('melaka:vendor:food-pak-putra-tandoori')::uuid;
  v_v_baboon uuid := md5('melaka:vendor:food-baboon-house')::uuid;
  v_v_atlas uuid := md5('melaka:vendor:guide-atlas-travel-services')::uuid;
  v_v_op_museums uuid := md5('melaka:vendor:op-melaka-museums')::uuid;
  v_v_op_taming_sari uuid := md5('melaka:vendor:op-taming-sari')::uuid;
  v_v_op_cruise uuid := md5('melaka:vendor:op-river-cruise')::uuid;
  v_v_op_baba uuid := md5('melaka:vendor:op-baba-nyonya-trust')::uuid;
  v_v_hotel_puri uuid := md5('melaka:vendor:accom-hotel-puri')::uuid;
  v_v_baba_house uuid := md5('melaka:vendor:accom-baba-house')::uuid;
  v_v_courtyard uuid := md5('melaka:vendor:accom-courtyard-heeren')::uuid;
  v_v_kooya uuid := md5('melaka:vendor:retail-kooya-handicraft')::uuid;
  v_v_clay_house uuid := md5('melaka:vendor:retail-clay-house')::uuid;
  v_v_abdul uuid := md5('melaka:vendor:retail-abdul-antiques')::uuid;

  -- demo owners (existing users)
  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  -- outlets (19)
  o_capitol uuid := md5('melaka:outlet:capitol-satay-celup-main')::uuid;
  o_famosa_crb uuid := md5('melaka:outlet:famosa-chicken-rice-ball-main')::uuid;
  o_geographer uuid := md5('melaka:outlet:geographer-cafe-jonker')::uuid;
  o_jonker88 uuid := md5('melaka:outlet:jonker-88-heritage-main')::uuid;
  o_pak_putra uuid := md5('melaka:outlet:pak-putra-tandoori-main')::uuid;
  o_baboon uuid := md5('melaka:outlet:baboon-house-main')::uuid;
  o_atlas uuid := md5('melaka:outlet:guide-atlas-travel')::uuid;
  o_op_stadthuys uuid := md5('melaka:outlet:op-stadthuys-counter')::uuid;
  o_op_taming_sari uuid := md5('melaka:outlet:op-taming-sari-booth')::uuid;
  o_op_cruise uuid := md5('melaka:outlet:op-river-cruise-jetty')::uuid;
  o_op_cruise_tun_ali uuid := md5('melaka:outlet:op-river-cruise-tun-ali')::uuid;
  o_op_baba uuid := md5('melaka:outlet:op-baba-nyonya-desk')::uuid;
  o_accom_puri uuid := md5('melaka:outlet:accom-hotel-puri')::uuid;
  o_accom_baba_house uuid := md5('melaka:outlet:accom-baba-house')::uuid;
  o_accom_courtyard uuid := md5('melaka:outlet:accom-courtyard-heeren')::uuid;
  o_kooya_tukang_emas uuid := md5('melaka:outlet:retail-kooya-tukang-emas')::uuid;
  o_kooya_hang_jebat uuid := md5('melaka:outlet:retail-kooya-hang-jebat')::uuid;
  o_clay_house uuid := md5('melaka:outlet:retail-clay-house')::uuid;
  o_abdul uuid := md5('melaka:outlet:retail-abdul-antiques')::uuid;

  -- products (29)
  p_capitol_platter uuid := md5('melaka:product:capitol-satay-celup-platter')::uuid;
  p_capitol_barley uuid := md5('melaka:product:capitol-iced-barley')::uuid;
  p_famosa_rice_ball uuid := md5('melaka:product:famosa-chicken-rice-ball-set')::uuid;
  p_famosa_chicken uuid := md5('melaka:product:famosa-steamed-chicken-half')::uuid;
  p_geo_laksa uuid := md5('melaka:product:geographer-nyonya-laksa')::uuid;
  p_geo_cendol uuid := md5('melaka:product:geographer-gula-melaka-cendol')::uuid;
  p_j88_cendol uuid := md5('melaka:product:jonker88-baba-cendol')::uuid;
  p_j88_laksa uuid := md5('melaka:product:jonker88-nyonya-asam-laksa')::uuid;
  p_pp_tandoori uuid := md5('melaka:product:pakputra-tandoori-chicken-set')::uuid;
  p_pp_naan uuid := md5('melaka:product:pakputra-garlic-naan')::uuid;
  p_baboon_burger uuid := md5('melaka:product:baboon-beef-burger')::uuid;
  p_baboon_coffee uuid := md5('melaka:product:baboon-house-coffee')::uuid;

  p_guide_night_walk uuid := md5('melaka:product:guide-jonker-night-food-walk')::uuid;
  p_guide_heritage uuid := md5('melaka:product:guide-old-town-heritage-walk')::uuid;
  p_guide_baba uuid := md5('melaka:product:guide-baba-nyonya-culture-tour')::uuid;

  p_op_stadthuys uuid := md5('melaka:product:op-stadthuys-entry')::uuid;
  p_op_taming_sari uuid := md5('melaka:product:op-taming-sari-ride')::uuid;
  p_op_cruise_day uuid := md5('melaka:product:op-river-cruise-day-ticket')::uuid;
  p_op_cruise_night uuid := md5('melaka:product:op-river-cruise-night')::uuid;
  p_op_baba_entry uuid := md5('melaka:product:op-baba-nyonya-entry')::uuid;

  p_accom_peranakan uuid := md5('melaka:product:accom-peranakan-heritage-room')::uuid;
  p_accom_courtyard_suite uuid := md5('melaka:product:accom-courtyard-suite')::uuid;
  p_accom_baba_deluxe uuid := md5('melaka:product:accom-baba-house-deluxe')::uuid;
  p_accom_heeren_twin uuid := md5('melaka:product:accom-heeren-shophouse-twin')::uuid;

  p_retail_slippers uuid := md5('melaka:product:retail-nyonya-beaded-slippers')::uuid;
  p_retail_beading_kit uuid := md5('melaka:product:retail-beading-starter-kit')::uuid;
  p_retail_pottery uuid := md5('melaka:product:retail-handmade-pottery-bowl')::uuid;
  p_retail_coasters uuid := md5('melaka:product:retail-peranakan-tile-coasters')::uuid;
  p_retail_brass_lamp uuid := md5('melaka:product:retail-antique-brass-lamp')::uuid;

  c_food uuid;
  c_activity uuid;
  c_accommodation uuid;
  c_retail uuid;
BEGIN
  SELECT id INTO c_food FROM categories WHERE slug = 'food';
  SELECT id INTO c_activity FROM categories WHERE slug = 'activity';
  SELECT id INTO c_accommodation FROM categories WHERE slug = 'accommodation';
  SELECT id INTO c_retail FROM categories WHERE slug = 'retail';
  IF c_food IS NULL OR c_activity IS NULL OR c_accommodation IS NULL OR c_retail IS NULL THEN
    RAISE EXCEPTION 'categories table is missing one of food/activity/accommodation/retail';
  END IF;

  -- 1. Vendors before places — places.managed_by_vendor_id references vendors.
  INSERT INTO vendors (id, owner_id, name, slug, description, business_type, status, approved_at)
  VALUES
    (v_v_capitol, v_owner_ali, 'Capitol Satay Celup', 'capitol-satay-celup',
     'Satay celup restaurant near Bukit Cina, serving skewers dipped in a shared communal pot.', 'food', 'approved', now()),
    (v_v_famosa_crb, v_owner_raj, 'Famosa Chicken Rice Ball', 'famosa-chicken-rice-ball',
     'Hainanese chicken rice, rolled into balls, on Jalan Hang Jebat.', 'food', 'approved', now()),
    (v_v_geographer, v_owner_siti, 'Geographér Café', 'geographer-cafe',
     'Heritage shophouse café serving Nyonya laksa and cendol on Jonker Street.', 'food', 'approved', now()),
    (v_v_jonker88, v_owner_ali, 'Jonker 88 Heritage', 'jonker-88-heritage',
     'Cendol and asam laksa stall on Jalan Hang Jebat.', 'food', 'approved', now()),
    (v_v_pak_putra, v_owner_raj, 'Pak Putra Tandoori', 'pak-putra-tandoori',
     'North Indian tandoori restaurant on Jalan Kota Laksamana.', 'food', 'approved', now()),
    (v_v_baboon, v_owner_siti, 'Baboon House', 'baboon-house',
     'Gallery, café and bar in a restored shophouse on Jalan Tun Tan Cheng Lock.', 'food', 'approved', now()),

    (v_v_atlas, v_owner_ali, 'Atlas Travel Services', 'atlas-travel-services',
     'Licensed travel agency on Jalan Hang Jebat offering local tours and transfers.', 'activity', 'approved', now()),

    (v_v_op_museums, v_owner_raj, 'Melaka Museums Corporation', 'melaka-museums-corporation',
     'Operator of the Stadthuys museum complex in Dutch Square.', 'attraction', 'approved', now()),
    (v_v_op_taming_sari, v_owner_siti, 'Menara Taming Sari', 'menara-taming-sari-vendor',
     'Operator of the Menara Taming Sari revolving tower.', 'attraction', 'approved', now()),
    (v_v_op_cruise, v_owner_ali, 'Melaka River Cruise', 'melaka-river-cruise-vendor',
     'Operator of the Melaka River day and night cruise.', 'attraction', 'approved', now()),
    (v_v_op_baba, v_owner_raj, 'Baba & Nyonya Heritage Trust', 'baba-nyonya-heritage-trust',
     'Custodian of the Baba & Nyonya Heritage Museum on Jalan Tun Tan Cheng Lock.', 'attraction', 'approved', now()),

    (v_v_hotel_puri, v_owner_siti, 'Hotel Puri', 'hotel-puri',
     'Heritage boutique hotel in a restored Peranakan townhouse.', 'accommodation', 'approved', now()),
    (v_v_baba_house, v_owner_ali, 'Baba House', 'baba-house-hotel',
     'Heritage shophouse hotel on Jalan Tun Tan Cheng Lock.', 'accommodation', 'approved', now()),
    (v_v_courtyard, v_owner_raj, 'Courtyard@Heeren', 'courtyard-heeren',
     'Boutique shophouse hotel on Heeren Street.', 'accommodation', 'approved', now()),

    (v_v_kooya, v_owner_siti, 'Kooya Handicraft', 'kooya-handicraft',
     'Nyonya beadwork and handicraft shop with two branches in the heritage core.', 'retail', 'approved', now()),
    (v_v_clay_house, v_owner_ali, 'The Clay House', 'the-clay-house',
     'Handmade pottery studio and shop on Jalan Tukang Emas.', 'retail', 'approved', now()),
    (v_v_abdul, v_owner_raj, 'Abdul Antiques', 'abdul-antiques',
     'Antiques and vintage furniture shop on Jalan Tun Tan Cheng Lock.', 'retail', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_capitol, v_v_famosa_crb, v_v_geographer, v_v_jonker88, v_v_pak_putra, v_v_baboon,
    v_v_atlas, v_v_op_museums, v_v_op_taming_sari, v_v_op_cruise, v_v_op_baba,
    v_v_hotel_puri, v_v_baba_house, v_v_courtyard, v_v_kooya, v_v_clay_house, v_v_abdul
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  -- 2. Places — state, 4 regions, 12 POIs. Coordinates per plan §3.1.
  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_melaka, NULL, 'state', 'Melaka', 'melaka', 'Melaka', NULL, 2.1896, 102.2501, NULL, NULL,
     '/assets/customer/malaysia/melaka-a-famosa.webp'),

    (v_bandar_hilir, v_melaka, 'region', 'Bandar Hilir', 'bandar-hilir', 'Melaka', 'Bandar Hilir', 2.1930, 102.2490, NULL, NULL, NULL),
    (v_melaka_river, v_melaka, 'region', 'Melaka River', 'melaka-river', 'Melaka', 'Melaka River', 2.1970, 102.2490, NULL, NULL, NULL),
    (v_klebang, v_melaka, 'region', 'Klebang & Pulau Melaka', 'klebang', 'Melaka', 'Klebang & Pulau Melaka', 2.2100, 102.2000, NULL, NULL, NULL),
    (v_ayer_keroh, v_melaka, 'region', 'Ayer Keroh', 'ayer-keroh', 'Melaka', 'Ayer Keroh', 2.2760, 102.2900, NULL, NULL, NULL),

    (v_p_famosa, v_bandar_hilir, 'poi', 'A Famosa (Porta de Santiago)', 'a-famosa', 'Melaka', 'Bandar Hilir', 2.1917, 102.2503, 0, NULL, NULL),
    (v_p_st_paul, v_bandar_hilir, 'poi', 'St. Paul''s Church', 'st-pauls-church', 'Melaka', 'Bandar Hilir', 2.1918, 102.2494, 0, NULL, NULL),
    (v_p_christ_church, v_bandar_hilir, 'poi', 'Christ Church & Dutch Square', 'christ-church-melaka', 'Melaka', 'Bandar Hilir', 2.1944, 102.2489, 0, NULL, NULL),
    (v_p_stadthuys, v_bandar_hilir, 'poi', 'The Stadthuys', 'the-stadthuys', 'Melaka', 'Bandar Hilir', 2.1939298, 102.2493511, 10.00, v_v_op_museums, NULL),
    (v_p_jonker, v_bandar_hilir, 'poi', 'Jonker Street', 'jonker-street', 'Melaka', 'Bandar Hilir', 2.1962, 102.2465, 0, NULL, NULL),
    (v_p_taming_sari, v_bandar_hilir, 'poi', 'Menara Taming Sari', 'menara-taming-sari', 'Melaka', 'Bandar Hilir', 2.1909757, 102.2472585, 25.00, v_v_op_taming_sari, NULL),

    (v_p_river_cruise, v_melaka_river, 'poi', 'Melaka River Cruise Jetty', 'melaka-river-cruise', 'Melaka', 'Melaka River', 2.1930, 102.2478, 30.00, v_v_op_cruise, NULL),
    (v_p_morten, v_melaka_river, 'poi', 'Kampung Morten', 'kampung-morten', 'Melaka', 'Melaka River', 2.2016, 102.2513, 0, NULL, NULL),
    -- POI coordinate corrected against Overpass (2.1953339/102.2467247); the
    -- plan's original guess (2.1960/102.2464) was 82m off. See migration header.
    (v_p_baba_nyonya, v_melaka_river, 'poi', 'Baba & Nyonya Heritage Museum', 'baba-nyonya-museum', 'Melaka', 'Melaka River', 2.1953339, 102.2467247, 18.00, v_v_op_baba, NULL),

    (v_p_straits_mosque, v_klebang, 'poi', 'Melaka Straits Mosque', 'melaka-straits-mosque', 'Melaka', 'Klebang & Pulau Melaka', 2.1830, 102.2380, 0, NULL, NULL),
    (v_p_klebang_beach, v_klebang, 'poi', 'Klebang Beach', 'klebang-beach', 'Melaka', 'Klebang & Pulau Melaka', 2.2130, 102.1930, 0, NULL, NULL),

    -- Priced but unmanaged — deliberate, see plan D9 / §2.5. Not a missing operator.
    (v_p_zoo, v_ayer_keroh, 'poi', 'Melaka Zoo', 'melaka-zoo', 'Melaka', 'Ayer Keroh', 2.2735, 102.2925, 25.00, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  -- 3. Outlets (19). city/state = 'Melaka'; address from OSM addr:street.
  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_capitol, v_v_capitol, 'Capitol Satay Celup', 'capitol-satay-celup-main', 'Lorong Bukit Cina', 'Melaka', 'Melaka', 2.1952772, 102.2522973),
    (o_famosa_crb, v_v_famosa_crb, 'Famosa Chicken Rice Ball', 'famosa-chicken-rice-ball-main', 'Jalan Hang Jebat', 'Melaka', 'Melaka', 2.1954682, 102.2475502),
    (o_geographer, v_v_geographer, 'Geographér Café', 'geographer-cafe-jonker', 'Jalan Hang Jebat', 'Melaka', 'Melaka', 2.1967607, 102.2463407),
    (o_jonker88, v_v_jonker88, 'Jonker 88 Heritage', 'jonker-88-heritage-main', 'Jalan Hang Jebat', 'Melaka', 'Melaka', 2.1966709, 102.2466399),
    (o_pak_putra, v_v_pak_putra, 'Pak Putra Tandoori', 'pak-putra-tandoori-main', 'Jalan Kota Laksamana', 'Melaka', 'Melaka', 2.1951951, 102.2436382),
    (o_baboon, v_v_baboon, 'Baboon House', 'baboon-house-main', 'Jalan Tun Tan Cheng Lock', 'Melaka', 'Melaka', 2.1957086, 102.2459323),

    (o_atlas, v_v_atlas, 'Atlas Travel Services', 'guide-atlas-travel', 'Jalan Hang Jebat', 'Melaka', 'Melaka', 2.1951797, 102.2480239),

    (o_op_stadthuys, v_v_op_museums, 'Melaka Museums — Stadthuys Counter', 'op-stadthuys-counter', 'Jalan Gereja', 'Melaka', 'Melaka', 2.1939298, 102.2493511),
    (o_op_taming_sari, v_v_op_taming_sari, 'Menara Taming Sari — Ticket Booth', 'op-taming-sari-booth', 'Jalan Merdeka', 'Melaka', 'Melaka', 2.1909757, 102.2472585),
    (o_op_cruise, v_v_op_cruise, 'Melaka River Cruise — Spice Garden Jetty', 'op-river-cruise-jetty', 'Jalan Tun Mutahir', 'Melaka', 'Melaka', 2.2073773, 102.2514835),
    (o_op_cruise_tun_ali, v_v_op_cruise, 'Melaka River Cruise — Jalan Tun Ali Jetty', 'op-river-cruise-tun-ali', 'Jalan Tun Ali', 'Melaka', 'Melaka', 2.2020314, 102.2494958),
    (o_op_baba, v_v_op_baba, 'Baba & Nyonya Heritage Museum — Front Desk', 'op-baba-nyonya-desk', 'Jalan Tun Tan Cheng Lock', 'Melaka', 'Melaka', 2.1953339, 102.2467247),

    (o_accom_puri, v_v_hotel_puri, 'Hotel Puri', 'accom-hotel-puri', 'Jalan Tun Tan Cheng Lock', 'Melaka', 'Melaka', 2.1964179, 102.2452678),
    (o_accom_baba_house, v_v_baba_house, 'Baba House', 'accom-baba-house', 'Jalan Tun Tan Cheng Lock', 'Melaka', 'Melaka', 2.1964203, 102.2450126),
    (o_accom_courtyard, v_v_courtyard, 'Courtyard@Heeren', 'accom-courtyard-heeren', 'Jalan Tun Tan Cheng Lock', 'Melaka', 'Melaka', 2.1957445, 102.2458888),

    (o_kooya_tukang_emas, v_v_kooya, 'Kooya Handicraft — Jalan Tukang Emas', 'retail-kooya-tukang-emas', 'Jalan Tukang Emas', 'Melaka', 'Melaka', 2.1965509, 102.2479797),
    (o_kooya_hang_jebat, v_v_kooya, 'Kooya Handicraft — Jalan Hang Jebat', 'retail-kooya-hang-jebat', 'Jalan Hang Jebat', 'Melaka', 'Melaka', 2.1967094, 102.2465402),
    (o_clay_house, v_v_clay_house, 'The Clay House', 'retail-clay-house', 'Jalan Tukang Emas', 'Melaka', 'Melaka', 2.1967200, 102.2478638),
    (o_abdul, v_v_abdul, 'Abdul Antiques', 'retail-abdul-antiques', 'Jalan Tun Tan Cheng Lock', 'Melaka', 'Melaka', 2.1957651, 102.2457348)
  ON CONFLICT (id) DO NOTHING;

  -- 4a. Food — every Melaka food vendor has exactly one outlet (plan D4).
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_capitol_platter, v_v_capitol, o_capitol, c_food, 'Satay Celup Platter', 'capitol-satay-celup-platter', 'Skewers of meat, seafood and vegetables, self-cooked in a shared satay-peanut pot.', 'food', false, 25.00),
    (p_capitol_barley, v_v_capitol, o_capitol, c_food, 'Iced Barley', 'capitol-iced-barley', 'Chilled barley water with winter melon.', 'food', false, 4.50),
    (p_famosa_rice_ball, v_v_famosa_crb, o_famosa_crb, c_food, 'Chicken Rice Ball Set', 'famosa-chicken-rice-ball-set', 'Hainanese chicken rice rolled into balls, with poached chicken.', 'food', false, 11.00),
    (p_famosa_chicken, v_v_famosa_crb, o_famosa_crb, c_food, 'Steamed Chicken (Half)', 'famosa-steamed-chicken-half', 'Half a poached kampung chicken with ginger-scallion oil.', 'food', false, 28.00),
    (p_geo_laksa, v_v_geographer, o_geographer, c_food, 'Nyonya Laksa', 'geographer-nyonya-laksa', 'Peranakan laksa in a rich coconut broth.', 'food', false, 16.00),
    (p_geo_cendol, v_v_geographer, o_geographer, c_food, 'Melaka Gula Cendol', 'geographer-gula-melaka-cendol', 'Shaved ice, pandan noodles and Melaka gula melaka syrup.', 'food', false, 8.00),
    (p_j88_cendol, v_v_jonker88, o_jonker88, c_food, 'Baba Cendol', 'jonker88-baba-cendol', 'Classic cendol with coconut milk and gula melaka.', 'food', false, 9.00),
    (p_j88_laksa, v_v_jonker88, o_jonker88, c_food, 'Nyonya Asam Laksa', 'jonker88-nyonya-asam-laksa', 'Tamarind fish-broth laksa with mint and torch ginger.', 'food', false, 14.00),
    (p_pp_tandoori, v_v_pak_putra, o_pak_putra, c_food, 'Tandoori Chicken Set', 'pakputra-tandoori-chicken-set', 'Tandoor-grilled chicken with dhal and rice.', 'food', false, 24.00),
    (p_pp_naan, v_v_pak_putra, o_pak_putra, c_food, 'Garlic Naan', 'pakputra-garlic-naan', 'Tandoor-baked naan with garlic and butter.', 'food', false, 6.00),
    (p_baboon_burger, v_v_baboon, o_baboon, c_food, 'Beef Burger', 'baboon-beef-burger', 'House-ground beef patty, brioche bun, hand-cut fries.', 'food', false, 28.00),
    (p_baboon_coffee, v_v_baboon, o_baboon, c_food, 'House Coffee', 'baboon-house-coffee', 'Single-origin filter coffee.', 'food', false, 10.00)
  ON CONFLICT (id) DO NOTHING;

  -- 4b. Guide services — outlet_id NULL, place-bound only. Real vendor
  -- (Atlas Travel Services), fictional itinerary names — see plan §2.4.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_guide_night_walk, v_v_atlas, NULL, c_activity, 'Jonker Street Night Food Walk', 'guide-jonker-night-food-walk', 'Evening walking tour of Jonker Street''s hawker stalls and night market.', 'experience', true, 85.00),
    (p_guide_heritage, v_v_atlas, NULL, c_activity, 'Old Town Heritage Walking Tour', 'guide-old-town-heritage-walk', 'Guided walk through the A Famosa and Dutch Square heritage core.', 'experience', true, 60.00),
    (p_guide_baba, v_v_atlas, NULL, c_activity, 'Baba Nyonya Culture Tour', 'guide-baba-nyonya-culture-tour', 'Guided cultural tour of the Baba & Nyonya Heritage Museum and surrounds.', 'experience', true, 75.00)
  ON CONFLICT (id) DO NOTHING;

  -- 4c. Attraction operators.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_op_stadthuys, v_v_op_museums, o_op_stadthuys, c_activity, 'Stadthuys Museum Entry', 'op-stadthuys-entry', 'Entry to the Stadthuys history and ethnography museum complex.', 'activity', true, 10.00),
    (p_op_taming_sari, v_v_op_taming_sari, o_op_taming_sari, c_activity, 'Taming Sari Revolving Tower Ride', 'op-taming-sari-ride', 'Rotating gyro-tower ride 80m above Bandar Hilir.', 'activity', true, 25.00),
    (p_op_cruise_day, v_v_op_cruise, o_op_cruise, c_activity, 'River Cruise Day Ticket', 'op-river-cruise-day-ticket', 'Daytime river cruise along the Melaka River.', 'activity', true, 30.00),
    (p_op_cruise_night, v_v_op_cruise, o_op_cruise, c_activity, 'Night River Cruise', 'op-river-cruise-night', 'Evening river cruise past the illuminated riverside murals.', 'activity', true, 35.00),
    (p_op_baba_entry, v_v_op_baba, o_op_baba, c_activity, 'Baba & Nyonya Museum Entry', 'op-baba-nyonya-entry', 'Entry to the Baba & Nyonya Heritage Museum townhouse.', 'activity', true, 18.00)
  ON CONFLICT (id) DO NOTHING;

  -- 4d. Accommodation — room type = product, rate plan = variant.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_accom_peranakan, v_v_hotel_puri, o_accom_puri, c_accommodation, 'Peranakan Heritage Room', 'accom-peranakan-heritage-room', 'Room with Peranakan tilework and antique furnishings.', 'service', true, 240.00),
    (p_accom_courtyard_suite, v_v_hotel_puri, o_accom_puri, c_accommodation, 'Courtyard Suite', 'accom-courtyard-suite', 'Suite opening onto the hotel''s internal courtyard.', 'service', true, 380.00),
    (p_accom_baba_deluxe, v_v_baba_house, o_accom_baba_house, c_accommodation, 'Baba House Deluxe Room', 'accom-baba-house-deluxe', 'Deluxe room in the restored heritage shophouse.', 'service', true, 210.00),
    (p_accom_heeren_twin, v_v_courtyard, o_accom_courtyard, c_accommodation, 'Heeren Shophouse Twin', 'accom-heeren-shophouse-twin', 'Twin room in the Heeren Street shophouse.', 'service', true, 180.00)
  ON CONFLICT (id) DO NOTHING;

  -- 4e. Retail — physical goods.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_retail_slippers, v_v_kooya, o_kooya_tukang_emas, c_retail, 'Nyonya Beaded Slippers', 'retail-nyonya-beaded-slippers', 'Hand-beaded Peranakan slippers.', 'product', false, 180.00),
    (p_retail_beading_kit, v_v_kooya, o_kooya_tukang_emas, c_retail, 'Beading Starter Kit', 'retail-beading-starter-kit', 'Beads, needle and pattern card for Nyonya beadwork.', 'product', false, 65.00),
    (p_retail_pottery, v_v_clay_house, o_clay_house, c_retail, 'Handmade Pottery Bowl', 'retail-handmade-pottery-bowl', 'Wheel-thrown stoneware bowl, glazed in-house.', 'product', false, 75.00),
    (p_retail_coasters, v_v_clay_house, o_clay_house, c_retail, 'Peranakan Tile Coaster Set', 'retail-peranakan-tile-coasters', 'Set of four ceramic coasters in Peranakan tile motifs.', 'product', false, 45.00),
    (p_retail_brass_lamp, v_v_abdul, o_abdul, c_retail, 'Antique Brass Lamp', 'retail-antique-brass-lamp', 'Restored vintage brass table lamp.', 'product', false, 220.00)
  ON CONFLICT (id) DO NOTHING;

  -- 5. outlet_offers — two real multi-outlet cases (plan §2.3, §3.4).
  INSERT INTO outlet_offers (product_id, outlet_id, price)
  SELECT p.id, o.id, p.base_price
  FROM (VALUES (p_retail_slippers), (p_retail_beading_kit)) AS pr(id)
  JOIN products p ON p.id = pr.id
  CROSS JOIN (VALUES (o_kooya_tukang_emas), (o_kooya_hang_jebat)) AS o(id)
  ON CONFLICT (product_id, outlet_id) DO NOTHING;

  INSERT INTO outlet_offers (product_id, outlet_id, price)
  SELECT p.id, o.id, p.base_price
  FROM (VALUES (p_op_cruise_day), (p_op_cruise_night)) AS pr(id)
  JOIN products p ON p.id = pr.id
  CROSS JOIN (VALUES (o_op_cruise), (o_op_cruise_tun_ali)) AS o(id)
  ON CONFLICT (product_id, outlet_id) DO NOTHING;

  -- 6. Variants — one default per accommodation and retail product, plus the
  --    breakfast upsell the two hotels actually offer and Kooya's second size.
  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('melaka:variant:accom-peranakan-room-only')::uuid, p_accom_peranakan, 'Room Only', 0, true),
    (md5('melaka:variant:accom-peranakan-breakfast')::uuid, p_accom_peranakan, 'Breakfast Included', 40, false),
    (md5('melaka:variant:accom-courtyard-suite-standard')::uuid, p_accom_courtyard_suite, 'Room Only', 0, true),
    (md5('melaka:variant:accom-baba-deluxe-room-only')::uuid, p_accom_baba_deluxe, 'Room Only', 0, true),
    (md5('melaka:variant:accom-baba-deluxe-breakfast')::uuid, p_accom_baba_deluxe, 'Breakfast Included', 35, false),
    (md5('melaka:variant:accom-heeren-twin-standard')::uuid, p_accom_heeren_twin, 'Standard', 0, true),
    (md5('melaka:variant:retail-slippers-36-38')::uuid, p_retail_slippers, 'Size 36–38', 0, true),
    (md5('melaka:variant:retail-slippers-39-41')::uuid, p_retail_slippers, 'Size 39–41', 0, false),
    (md5('melaka:variant:retail-beading-kit-standard')::uuid, p_retail_beading_kit, 'Standard', 0, true),
    (md5('melaka:variant:retail-pottery-standard')::uuid, p_retail_pottery, 'Standard', 0, true),
    (md5('melaka:variant:retail-coasters-standard')::uuid, p_retail_coasters, 'Standard', 0, true),
    (md5('melaka:variant:retail-brass-lamp-standard')::uuid, p_retail_brass_lamp, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  -- 7. Inventory — retail products only, quantity 50 per outlet.
  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, COALESCE(p.outlet_id, o.id)
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  LEFT JOIN outlets o ON p.outlet_id IS NULL AND o.vendor_id = p.vendor_id
  WHERE p.id IN (p_retail_slippers, p_retail_beading_kit, p_retail_pottery,
                 p_retail_coasters, p_retail_brass_lamp)
  ON CONFLICT DO NOTHING;

  -- 8. product_places — the load-bearing links (8 rows, plan §3.5).
  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_guide_night_walk, v_p_jonker, 'guide_service'),
    (p_guide_heritage, v_p_famosa, 'guide_service'),
    (p_op_stadthuys, v_p_stadthuys, 'admission'),
    (p_op_taming_sari, v_p_taming_sari, 'admission'),
    (p_op_cruise_day, v_p_river_cruise, 'admission'),
    (p_op_cruise_night, v_p_river_cruise, 'addon'),
    (p_op_baba_entry, v_p_baba_nyonya, 'admission'),
    (p_guide_baba, v_p_baba_nyonya, 'guide_service')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- 9. Historical replay — fabricated demo data attached to real business
  -- names (see header disclaimer). Excludes the 3 guide products (outlet_id
  -- IS NULL). 2 orders per food/operator product, 1 per accommodation/retail.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-MK-SEED') THEN

    -- orders_require_phone_verification (082_phone_verification_checkout_guards.sql)
    -- lets service_role bypass the auth.uid()/phone-verified checks; migrations
    -- run without a PostgREST JWT context, so auth.jwt() is otherwise empty.
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    INSERT INTO wallets (user_id) VALUES (v_owner_ali), (v_owner_raj), (v_owner_siti)
    ON CONFLICT (user_id) DO NOTHING;

    DECLARE
      rec RECORD;
      v_customers uuid[] := ARRAY[
        'aaaaaaaa-0000-0000-0000-000000000005',
        'aaaaaaaa-0000-0000-0000-000000000006',
        'aaaaaaaa-0000-0000-0000-000000000007',
        'aaaaaaaa-0000-0000-0000-000000000008'
      ];
      v_customer uuid;
      v_owner uuid;
      v_order_id uuid;
      v_order_item_id uuid;
      v_slot_id uuid;
      v_order_date timestamptz;
      v_qty int;
      v_line_total numeric;
      i int;
      v_first BOOLEAN := true;
    BEGIN
      FOR rec IN
        SELECT * FROM (VALUES
          (p_capitol_platter, v_v_capitol, o_capitol, 'Satay Celup Platter', 25.00::numeric, false, 2),
          (p_capitol_barley, v_v_capitol, o_capitol, 'Iced Barley', 4.50::numeric, false, 2),
          (p_famosa_rice_ball, v_v_famosa_crb, o_famosa_crb, 'Chicken Rice Ball Set', 11.00::numeric, false, 2),
          (p_famosa_chicken, v_v_famosa_crb, o_famosa_crb, 'Steamed Chicken (Half)', 28.00::numeric, false, 2),
          (p_geo_laksa, v_v_geographer, o_geographer, 'Nyonya Laksa', 16.00::numeric, false, 2),
          (p_geo_cendol, v_v_geographer, o_geographer, 'Melaka Gula Cendol', 8.00::numeric, false, 2),
          (p_j88_cendol, v_v_jonker88, o_jonker88, 'Baba Cendol', 9.00::numeric, false, 2),
          (p_j88_laksa, v_v_jonker88, o_jonker88, 'Nyonya Asam Laksa', 14.00::numeric, false, 2),
          (p_pp_tandoori, v_v_pak_putra, o_pak_putra, 'Tandoori Chicken Set', 24.00::numeric, false, 2),
          (p_pp_naan, v_v_pak_putra, o_pak_putra, 'Garlic Naan', 6.00::numeric, false, 2),
          (p_baboon_burger, v_v_baboon, o_baboon, 'Beef Burger', 28.00::numeric, false, 2),
          (p_baboon_coffee, v_v_baboon, o_baboon, 'House Coffee', 10.00::numeric, false, 2),

          (p_op_stadthuys, v_v_op_museums, o_op_stadthuys, 'Stadthuys Museum Entry', 10.00::numeric, true, 2),
          (p_op_taming_sari, v_v_op_taming_sari, o_op_taming_sari, 'Taming Sari Revolving Tower Ride', 25.00::numeric, true, 2),
          (p_op_cruise_day, v_v_op_cruise, o_op_cruise, 'River Cruise Day Ticket', 30.00::numeric, true, 2),
          (p_op_cruise_night, v_v_op_cruise, o_op_cruise, 'Night River Cruise', 35.00::numeric, true, 2),
          (p_op_baba_entry, v_v_op_baba, o_op_baba, 'Baba & Nyonya Museum Entry', 18.00::numeric, true, 2),

          (p_accom_peranakan, v_v_hotel_puri, o_accom_puri, 'Peranakan Heritage Room', 240.00::numeric, true, 1),
          (p_accom_courtyard_suite, v_v_hotel_puri, o_accom_puri, 'Courtyard Suite', 380.00::numeric, true, 1),
          (p_accom_baba_deluxe, v_v_baba_house, o_accom_baba_house, 'Baba House Deluxe Room', 210.00::numeric, true, 1),
          (p_accom_heeren_twin, v_v_courtyard, o_accom_courtyard, 'Heeren Shophouse Twin', 180.00::numeric, true, 1),

          (p_retail_slippers, v_v_kooya, o_kooya_tukang_emas, 'Nyonya Beaded Slippers', 180.00::numeric, false, 1),
          (p_retail_beading_kit, v_v_kooya, o_kooya_tukang_emas, 'Beading Starter Kit', 65.00::numeric, false, 1),
          (p_retail_pottery, v_v_clay_house, o_clay_house, 'Handmade Pottery Bowl', 75.00::numeric, false, 1),
          (p_retail_coasters, v_v_clay_house, o_clay_house, 'Peranakan Tile Coaster Set', 45.00::numeric, false, 1),
          (p_retail_brass_lamp, v_v_abdul, o_abdul, 'Antique Brass Lamp', 220.00::numeric, false, 1)
        ) AS t(product_id, vendor_id, outlet_id, product_name, unit_price, needs_booking, order_count)
      LOOP
        SELECT v.owner_id INTO v_owner FROM vendors v WHERE v.id = rec.vendor_id;

        FOR i IN 1..rec.order_count LOOP
          v_customer := v_customers[1 + floor(random() * 4)::int];
          v_order_date := now() - (random() * 90 || ' days')::interval;
          v_qty := 1 + floor(random() * 2)::int;
          v_line_total := rec.unit_price * v_qty;

          INSERT INTO orders (user_id, status, subtotal, total_amount, currency, payment_method, paid_at, completed_at, created_at)
          VALUES (v_customer, 'completed', v_line_total, v_line_total, 'MYR', 'mock_card', v_order_date, v_order_date, v_order_date)
          RETURNING id INTO v_order_id;

          IF v_first THEN
            UPDATE orders SET display_id = 'ORD-MK-SEED' WHERE id = v_order_id;
            v_first := false;
          END IF;

          v_slot_id := NULL;
          IF rec.needs_booking THEN
            INSERT INTO booking_slots (product_id, outlet_id, starts_at, ends_at, capacity, booked, status)
            VALUES (rec.product_id, rec.outlet_id, v_order_date, v_order_date + interval '2 hours', 10, v_qty, 'available')
            RETURNING id INTO v_slot_id;
          END IF;

          INSERT INTO order_items (order_id, vendor_id, outlet_id, product_id, slot_id, product_name, unit_price, quantity, line_total, fulfil_status, fulfilled_at, created_at)
          VALUES (v_order_id, rec.vendor_id, rec.outlet_id, rec.product_id, v_slot_id, rec.product_name, rec.unit_price, v_qty, v_line_total, 'fulfilled', v_order_date, v_order_date)
          RETURNING id INTO v_order_item_id;

          IF rec.needs_booking THEN
            INSERT INTO bookings (order_item_id, slot_id, customer_id, status, check_in_at, created_at)
            VALUES (v_order_item_id, v_slot_id, v_customer, 'checked_in', v_order_date, v_order_date);
          END IF;

          IF random() < 0.6 THEN
            INSERT INTO reviews (user_id, order_item_id, vendor_id, outlet_id, product_id, rating, title, body, created_at)
            VALUES (
              v_customer, v_order_item_id, rec.vendor_id, rec.outlet_id, rec.product_id,
              3 + floor(random() * 3)::int,
              'Great experience',
              'Really enjoyed ' || rec.product_name || '. Would recommend.',
              v_order_date + interval '1 day'
            );
          END IF;

          IF v_line_total > 0 THEN
            INSERT INTO wallet_transactions (user_id, wallet_id, type, amount_sen, bucket, direction, order_id, created_at)
            SELECT v_owner, w.id, 'earnings', round(v_line_total * 100)::bigint, 'earnings', 'credit', v_order_id, v_order_date
            FROM wallets w WHERE w.user_id = v_owner;

            UPDATE wallets
            SET available_balance = available_balance + v_line_total,
                earnings_sen = earnings_sen + round(v_line_total * 100)::bigint
            WHERE user_id = v_owner;
          END IF;
        END LOOP;
      END LOOP;
    END;

  END IF;

END $$;

-- ── Post-conditions — fail loudly rather than leave a half-seeded database ──
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM vendors WHERE id IN (
    SELECT vendor_id FROM outlets WHERE state = 'Melaka');
  IF n <> 17 THEN RAISE EXCEPTION 'expected 17 Melaka vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Melaka';
  IF n <> 19 THEN RAISE EXCEPTION 'expected 19 Melaka outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products WHERE vendor_id IN (
    SELECT id FROM vendors WHERE id IN (
      md5('melaka:vendor:food-capitol-satay-celup')::uuid,
      md5('melaka:vendor:food-famosa-chicken-rice-ball')::uuid,
      md5('melaka:vendor:food-geographer-cafe')::uuid,
      md5('melaka:vendor:food-jonker-88-heritage')::uuid,
      md5('melaka:vendor:food-pak-putra-tandoori')::uuid,
      md5('melaka:vendor:food-baboon-house')::uuid,
      md5('melaka:vendor:guide-atlas-travel-services')::uuid,
      md5('melaka:vendor:op-melaka-museums')::uuid,
      md5('melaka:vendor:op-taming-sari')::uuid,
      md5('melaka:vendor:op-river-cruise')::uuid,
      md5('melaka:vendor:op-baba-nyonya-trust')::uuid,
      md5('melaka:vendor:accom-hotel-puri')::uuid,
      md5('melaka:vendor:accom-baba-house')::uuid,
      md5('melaka:vendor:accom-courtyard-heeren')::uuid,
      md5('melaka:vendor:retail-kooya-handicraft')::uuid,
      md5('melaka:vendor:retail-clay-house')::uuid,
      md5('melaka:vendor:retail-abdul-antiques')::uuid
    ));
  IF n <> 29 THEN RAISE EXCEPTION 'expected 29 Melaka products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Melaka'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Melaka products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Melaka';
  IF n <> 17 THEN RAISE EXCEPTION 'expected 17 Melaka places (1 state + 4 regions + 12 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Melaka';
  IF n <> 8 THEN RAISE EXCEPTION 'expected 8 Melaka product_places links, found %', n; END IF;
END $$;

COMMIT;
