-- Terengganu place model — seed data.
-- See docs/plans/2026-08-14-1830-terengganu-real-business-seed.md
--
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real
-- Terengganu (Kuala Terengganu, Pulau Wan Man, Merang) businesses sourced
-- from OpenStreetMap — © OpenStreetMap contributors, ODbL v1.0.
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, reviews, ratings, revenue
-- and wallet balances in the replay block are randomly generated demo
-- content for an academic project. They do not describe the real
-- businesses named here.
--
-- NO EXCEPTIONS: every vendor, outlet, name and coordinate below is real.
-- Taman Tamadun Islam's operator company was not resolvable via OSM, so
-- the attraction itself (a real, OSM-tagged tourism node) is used
-- directly as the vendor (see plan D3).
--
-- category_id resolved once via c_food/c_activity/c_accommodation/c_retail.

BEGIN;

DO $$
DECLARE
  v_terengganu uuid := md5('terengganu:place:terengganu')::uuid;
  v_kt uuid := md5('terengganu:place:kuala-terengganu')::uuid;
  v_wan_man uuid := md5('terengganu:place:pulau-wan-man')::uuid;
  v_merang uuid := md5('terengganu:place:merang')::uuid;

  v_p_pasar_payang uuid := md5('terengganu:place:pasar-payang')::uuid;
  v_p_chinatown_gate uuid := md5('terengganu:place:chinatown-gate')::uuid;
  v_p_turtle_alley uuid := md5('terengganu:place:turtle-alley')::uuid;
  v_p_water_front uuid := md5('terengganu:place:water-front')::uuid;
  v_p_museum uuid := md5('terengganu:place:terengganu-state-museum')::uuid;
  v_p_kg_cina_bridge uuid := md5('terengganu:place:kampung-cina-bridge')::uuid;
  v_p_masjid_kristal uuid := md5('terengganu:place:masjid-kristal')::uuid;
  v_p_tamadun_islam uuid := md5('terengganu:place:taman-tamadun-islam')::uuid;
  v_p_merang_jetty uuid := md5('terengganu:place:merang-jetty')::uuid;
  v_p_pulau_redang uuid := md5('terengganu:place:pulau-redang')::uuid;

  v_v_madam_bee uuid := md5('terengganu:vendor:food-madam-bees-kitchen')::uuid;
  v_v_mei_fong uuid := md5('terengganu:vendor:food-mei-fong-curry-noodles')::uuid;
  v_v_nasi_dagang uuid := md5('terengganu:vendor:food-nasi-dagang-vintage')::uuid;

  v_v_desa_murni uuid := md5('terengganu:vendor:retail-desa-murni-batik')::uuid;

  v_v_sri_terengganu uuid := md5('terengganu:vendor:accom-hotel-sri-terengganu')::uuid;
  v_v_citi_point uuid := md5('terengganu:vendor:accom-dj-citi-point-hotel')::uuid;
  v_v_sri_tanjung uuid := md5('terengganu:vendor:accom-hotel-sri-tanjung')::uuid;

  v_v_alibaba uuid := md5('terengganu:vendor:guide-alibaba')::uuid;
  v_v_redang_pelangi uuid := md5('terengganu:vendor:guide-redang-pelangi-resort')::uuid;

  v_v_tamadun_islam uuid := md5('terengganu:vendor:op-taman-tamadun-islam')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_madam_bee uuid := md5('terengganu:outlet:madam-bees-kitchen')::uuid;
  o_mei_fong uuid := md5('terengganu:outlet:mei-fong-curry-noodles')::uuid;
  o_nasi_dagang uuid := md5('terengganu:outlet:nasi-dagang-vintage')::uuid;
  o_desa_murni uuid := md5('terengganu:outlet:desa-murni-batik')::uuid;
  o_sri_terengganu uuid := md5('terengganu:outlet:hotel-sri-terengganu')::uuid;
  o_citi_point uuid := md5('terengganu:outlet:dj-citi-point-hotel')::uuid;
  o_sri_tanjung uuid := md5('terengganu:outlet:hotel-sri-tanjung')::uuid;
  o_alibaba uuid := md5('terengganu:outlet:alibaba')::uuid;
  o_redang_pelangi uuid := md5('terengganu:outlet:redang-pelangi-resort')::uuid;
  o_tamadun_islam uuid := md5('terengganu:outlet:taman-tamadun-islam')::uuid;

  p_madambee_nasi uuid := md5('terengganu:product:madambee-nasi-dagang')::uuid;
  p_madambee_keropok uuid := md5('terengganu:product:madambee-keropok-lekor')::uuid;
  p_meifong_curry uuid := md5('terengganu:product:meifong-curry-noodle')::uuid;
  p_meifong_kolo uuid := md5('terengganu:product:meifong-kolo-mee')::uuid;
  p_nasidagang_vintage uuid := md5('terengganu:product:nasidagang-vintage-set')::uuid;
  p_nasidagang_ikan uuid := md5('terengganu:product:nasidagang-ikan-tongkol')::uuid;

  p_desamurni_sarong uuid := md5('terengganu:product:desamurni-batik-sarong')::uuid;

  p_redang_daytrip uuid := md5('terengganu:product:pulau-redang-day-trip')::uuid;
  p_redang_resort uuid := md5('terengganu:product:pulau-redang-resort-package')::uuid;

  p_tamadun_ticket uuid := md5('terengganu:product:tamadun-islam-entry-ticket')::uuid;

  p_sriterengganu_standard uuid := md5('terengganu:product:sriterengganu-standard-room')::uuid;
  p_sriterengganu_deluxe uuid := md5('terengganu:product:sriterengganu-deluxe-room')::uuid;
  p_citipoint_room uuid := md5('terengganu:product:citipoint-room')::uuid;
  p_citipoint_suite uuid := md5('terengganu:product:citipoint-suite')::uuid;
  p_sritanjung_standard uuid := md5('terengganu:product:sritanjung-standard-room')::uuid;
  p_sritanjung_family uuid := md5('terengganu:product:sritanjung-family-room')::uuid;

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

  INSERT INTO vendors (id, owner_id, name, slug, description, business_type, status, approved_at)
  VALUES
    (v_v_madam_bee, v_owner_ali, 'Madam Bee''s Kitchen', 'madam-bees-kitchen',
     'Restaurant in Kuala Terengganu.', 'food', 'approved', now()),
    (v_v_mei_fong, v_owner_raj, 'Mei Fong Curry Noodles', 'mei-fong-curry-noodles',
     'Curry noodle restaurant in Kuala Terengganu.', 'food', 'approved', now()),
    (v_v_nasi_dagang, v_owner_siti, 'Nasi Dagang Vintage', 'nasi-dagang-vintage',
     'Nasi dagang restaurant in Kuala Terengganu.', 'food', 'approved', now()),

    (v_v_desa_murni, v_owner_ali, 'Desa Murni Batik', 'desa-murni-batik',
     'Batik factory and shop in Kuala Terengganu.', 'retail', 'approved', now()),

    (v_v_sri_terengganu, v_owner_raj, 'Hotel Sri Terengganu', 'hotel-sri-terengganu',
     'Hotel in Kuala Terengganu.', 'accommodation', 'approved', now()),
    (v_v_citi_point, v_owner_siti, 'DJ Citi Point Hotel', 'dj-citi-point-hotel',
     'Hotel in Kuala Terengganu.', 'accommodation', 'approved', now()),
    (v_v_sri_tanjung, v_owner_ali, 'Hotel Sri Tanjung', 'hotel-sri-tanjung',
     'Hotel in Kuala Terengganu.', 'accommodation', 'approved', now()),

    (v_v_alibaba, v_owner_raj, 'Alibaba', 'alibaba',
     'Licensed travel agency in Kuala Terengganu.', 'activity', 'approved', now()),
    (v_v_redang_pelangi, v_owner_siti, 'Redang Pelangi Resort', 'redang-pelangi-resort',
     'Licensed travel agency and island resort operator in Kuala Terengganu.', 'activity', 'approved', now()),

    (v_v_tamadun_islam, v_owner_ali, 'Taman Tamadun Islam', 'taman-tamadun-islam',
     'Islamic civilisation theme park on Pulau Wan Man.', 'attraction', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_madam_bee, v_v_mei_fong, v_v_nasi_dagang, v_v_desa_murni,
    v_v_sri_terengganu, v_v_citi_point, v_v_sri_tanjung,
    v_v_alibaba, v_v_redang_pelangi, v_v_tamadun_islam
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_terengganu, NULL, 'state', 'Terengganu', 'terengganu', 'Terengganu', NULL, 5.3296, 103.1370, NULL, NULL, NULL),

    (v_kt, v_terengganu, 'region', 'Kuala Terengganu', 'kuala-terengganu', 'Terengganu', 'Kuala Terengganu', 5.3296, 103.1370, NULL, NULL, NULL),
    (v_wan_man, v_terengganu, 'region', 'Pulau Wan Man', 'pulau-wan-man', 'Terengganu', 'Pulau Wan Man', 5.3218, 103.1188, NULL, NULL, NULL),
    (v_merang, v_terengganu, 'region', 'Merang', 'merang', 'Terengganu', 'Merang', 5.5288, 102.9460, NULL, NULL, NULL),

    (v_p_pasar_payang, v_kt, 'poi', 'Pasar Payang', 'pasar-payang', 'Terengganu', 'Kuala Terengganu', 5.336668, 103.135749, 0, NULL, NULL),
    (v_p_chinatown_gate, v_kt, 'poi', 'Terengganu China Town Gate', 'chinatown-gate', 'Terengganu', 'Kuala Terengganu', 5.332058, 103.132512, 0, NULL, NULL),
    (v_p_turtle_alley, v_kt, 'poi', 'Turtle Alley', 'turtle-alley', 'Terengganu', 'Kuala Terengganu', 5.331943, 103.132255, 0, NULL, NULL),
    (v_p_water_front, v_kt, 'poi', 'Water Front', 'water-front', 'Terengganu', 'Kuala Terengganu', 5.324070, 103.131144, 0, NULL, NULL),
    (v_p_museum, v_kt, 'poi', 'Muzium Negeri Terengganu', 'terengganu-state-museum', 'Terengganu', 'Kuala Terengganu', 5.318573, 103.102113, 0, NULL, NULL),
    (v_p_kg_cina_bridge, v_kt, 'poi', 'Kampung Cina Bridge', 'kampung-cina-bridge', 'Terengganu', 'Kuala Terengganu', 5.334245, 103.133410, 0, NULL, NULL),
    (v_p_masjid_kristal, v_wan_man, 'poi', 'Masjid Kristal', 'masjid-kristal', 'Terengganu', 'Pulau Wan Man', 5.322156, 103.120673, 0, NULL, NULL),
    (v_p_tamadun_islam, v_wan_man, 'poi', 'Taman Tamadun Islam', 'taman-tamadun-islam', 'Terengganu', 'Pulau Wan Man', 5.321400, 103.116905, 20.00, v_v_tamadun_islam, NULL),
    (v_p_merang_jetty, v_merang, 'poi', 'Merang Jetty', 'merang-jetty', 'Terengganu', 'Merang', 5.528752, 102.945977, 0, NULL, NULL),
    (v_p_pulau_redang, v_merang, 'poi', 'Pulau Redang', 'pulau-redang', 'Terengganu', 'Merang', 5.783614, 103.016211, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_madam_bee, v_v_madam_bee, 'Madam Bee''s Kitchen', 'madam-bees-kitchen', NULL, 'Kuala Terengganu', 'Terengganu', 5.332766, 103.132596),
    (o_mei_fong, v_v_mei_fong, 'Mei Fong Curry Noodles', 'mei-fong-curry-noodles', NULL, 'Kuala Terengganu', 'Terengganu', 5.332866, 103.132816),
    (o_nasi_dagang, v_v_nasi_dagang, 'Nasi Dagang Vintage', 'nasi-dagang-vintage', NULL, 'Kuala Terengganu', 'Terengganu', 5.336684, 103.139564),

    (o_desa_murni, v_v_desa_murni, 'Desa Murni Batik', 'desa-murni-batik', NULL, 'Kuala Terengganu', 'Terengganu', 5.313634, 103.138898),

    (o_sri_terengganu, v_v_sri_terengganu, 'Hotel Sri Terengganu', 'hotel-sri-terengganu', NULL, 'Kuala Terengganu', 'Terengganu', 5.328649, 103.144374),
    (o_citi_point, v_v_citi_point, 'DJ Citi Point Hotel', 'dj-citi-point-hotel', NULL, 'Kuala Terengganu', 'Terengganu', 5.334001, 103.136414),
    (o_sri_tanjung, v_v_sri_tanjung, 'Hotel Sri Tanjung', 'hotel-sri-tanjung', NULL, 'Kuala Terengganu', 'Terengganu', 5.336568, 103.140398),

    (o_alibaba, v_v_alibaba, 'Alibaba', 'alibaba', NULL, 'Kuala Terengganu', 'Terengganu', 5.332531, 103.137607),
    (o_redang_pelangi, v_v_redang_pelangi, 'Redang Pelangi Resort', 'redang-pelangi-resort', NULL, 'Kuala Terengganu', 'Terengganu', 5.332197, 103.137842),

    (o_tamadun_islam, v_v_tamadun_islam, 'Taman Tamadun Islam', 'taman-tamadun-islam', NULL, 'Pulau Wan Man', 'Terengganu', 5.321400, 103.116905)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_madambee_nasi, v_v_madam_bee, o_madam_bee, c_food, 'Nasi Dagang', 'madambee-nasi-dagang', 'Steamed glutinous rice with fish curry.', 'food', false, 10.00),
    (p_madambee_keropok, v_v_madam_bee, o_madam_bee, c_food, 'Keropok Lekor', 'madambee-keropok-lekor', 'Fried fish sausage, a Terengganu specialty.', 'food', false, 6.00),
    (p_meifong_curry, v_v_mei_fong, o_mei_fong, c_food, 'Curry Noodle', 'meifong-curry-noodle', 'Noodles in spiced curry broth.', 'food', false, 9.00),
    (p_meifong_kolo, v_v_mei_fong, o_mei_fong, c_food, 'Kolo Mee', 'meifong-kolo-mee', 'Dry tossed noodles.', 'food', false, 8.00),
    (p_nasidagang_vintage, v_v_nasi_dagang, o_nasi_dagang, c_food, 'Nasi Dagang Vintage Set', 'nasidagang-vintage-set', 'House-special nasi dagang set.', 'food', false, 12.00),
    (p_nasidagang_ikan, v_v_nasi_dagang, o_nasi_dagang, c_food, 'Ikan Tongkol Curry', 'nasidagang-ikan-tongkol', 'Tuna curry side dish.', 'food', false, 8.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_desamurni_sarong, v_v_desa_murni, o_desa_murni, c_retail, 'Batik Sarong', 'desamurni-batik-sarong', 'Hand-drawn batik sarong.', 'product', false, 55.00)
  ON CONFLICT (id) DO NOTHING;

  -- Guide services — outlet_id NULL, place-bound only. Real vendors (2
  -- licensed KT travel operators), plausible itinerary names — see plan D8.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_redang_daytrip, v_v_alibaba, NULL, c_activity, 'Pulau Redang Day Trip', 'pulau-redang-day-trip', 'Day trip boat transfer and snorkelling at Pulau Redang.', 'experience', true, 180.00),
    (p_redang_resort, v_v_redang_pelangi, NULL, c_activity, 'Pulau Redang Resort Package', 'pulau-redang-resort-package', 'Two-day one-night island resort package at Pulau Redang.', 'experience', true, 420.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_tamadun_ticket, v_v_tamadun_islam, o_tamadun_islam, c_activity, 'Entry Ticket', 'tamadun-islam-entry-ticket', 'Entry to Taman Tamadun Islam.', 'activity', true, 20.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_sriterengganu_standard, v_v_sri_terengganu, o_sri_terengganu, c_accommodation, 'Standard Room', 'sriterengganu-standard-room', 'Standard room at Hotel Sri Terengganu.', 'service', true, 110.00),
    (p_sriterengganu_deluxe, v_v_sri_terengganu, o_sri_terengganu, c_accommodation, 'Deluxe Room', 'sriterengganu-deluxe-room', 'Deluxe room at Hotel Sri Terengganu.', 'service', true, 150.00),
    (p_citipoint_room, v_v_citi_point, o_citi_point, c_accommodation, 'Deluxe Room', 'citipoint-room', 'Deluxe room at DJ Citi Point Hotel.', 'service', true, 130.00),
    (p_citipoint_suite, v_v_citi_point, o_citi_point, c_accommodation, 'Suite', 'citipoint-suite', 'Suite at DJ Citi Point Hotel.', 'service', true, 210.00),
    (p_sritanjung_standard, v_v_sri_tanjung, o_sri_tanjung, c_accommodation, 'Standard Room', 'sritanjung-standard-room', 'Standard room at Hotel Sri Tanjung.', 'service', true, 100.00),
    (p_sritanjung_family, v_v_sri_tanjung, o_sri_tanjung, c_accommodation, 'Family Room', 'sritanjung-family-room', 'Family room at Hotel Sri Tanjung.', 'service', true, 160.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('terengganu:variant:sriterengganu-standard')::uuid, p_sriterengganu_standard, 'Room Only', 0, true),
    (md5('terengganu:variant:sriterengganu-deluxe')::uuid, p_sriterengganu_deluxe, 'Room Only', 0, true),
    (md5('terengganu:variant:citipoint-room')::uuid, p_citipoint_room, 'Room Only', 0, true),
    (md5('terengganu:variant:citipoint-suite')::uuid, p_citipoint_suite, 'Room Only', 0, true),
    (md5('terengganu:variant:sritanjung-standard')::uuid, p_sritanjung_standard, 'Room Only', 0, true),
    (md5('terengganu:variant:sritanjung-family')::uuid, p_sritanjung_family, 'Room Only', 0, true),
    (md5('terengganu:variant:desamurni-sarong')::uuid, p_desamurni_sarong, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_desamurni_sarong)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_redang_daytrip, v_p_pulau_redang, 'guide_service'),
    (p_redang_resort, v_p_pulau_redang, 'guide_service'),
    (p_tamadun_ticket, v_p_tamadun_islam, 'admission'),
    (p_desamurni_sarong, v_p_pasar_payang, 'addon')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- Historical replay — fabricated demo data attached to real business
  -- names. Excludes the 2 guide products (outlet_id IS NULL). 2 orders per
  -- food/attraction product, 1 per accommodation/retail product.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-TR-SEED') THEN

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
          (p_madambee_nasi, v_v_madam_bee, o_madam_bee, 'Nasi Dagang', 10.00::numeric, false, 2),
          (p_madambee_keropok, v_v_madam_bee, o_madam_bee, 'Keropok Lekor', 6.00::numeric, false, 2),
          (p_meifong_curry, v_v_mei_fong, o_mei_fong, 'Curry Noodle', 9.00::numeric, false, 2),
          (p_meifong_kolo, v_v_mei_fong, o_mei_fong, 'Kolo Mee', 8.00::numeric, false, 2),
          (p_nasidagang_vintage, v_v_nasi_dagang, o_nasi_dagang, 'Nasi Dagang Vintage Set', 12.00::numeric, false, 2),
          (p_nasidagang_ikan, v_v_nasi_dagang, o_nasi_dagang, 'Ikan Tongkol Curry', 8.00::numeric, false, 2),

          (p_tamadun_ticket, v_v_tamadun_islam, o_tamadun_islam, 'Entry Ticket', 20.00::numeric, true, 2),

          (p_desamurni_sarong, v_v_desa_murni, o_desa_murni, 'Batik Sarong', 55.00::numeric, false, 1),

          (p_sriterengganu_standard, v_v_sri_terengganu, o_sri_terengganu, 'Standard Room', 110.00::numeric, true, 1),
          (p_sriterengganu_deluxe, v_v_sri_terengganu, o_sri_terengganu, 'Deluxe Room', 150.00::numeric, true, 1),
          (p_citipoint_room, v_v_citi_point, o_citi_point, 'Deluxe Room', 130.00::numeric, true, 1),
          (p_citipoint_suite, v_v_citi_point, o_citi_point, 'Suite', 210.00::numeric, true, 1),
          (p_sritanjung_standard, v_v_sri_tanjung, o_sri_tanjung, 'Standard Room', 100.00::numeric, true, 1),
          (p_sritanjung_family, v_v_sri_tanjung, o_sri_tanjung, 'Family Room', 160.00::numeric, true, 1)
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
            UPDATE orders SET display_id = 'ORD-TR-SEED' WHERE id = v_order_id;
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
    SELECT vendor_id FROM outlets WHERE state = 'Terengganu');
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Terengganu vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Terengganu';
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Terengganu outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE v.id IN (SELECT vendor_id FROM outlets WHERE state = 'Terengganu')
       OR v.id IN (
         md5('terengganu:vendor:guide-alibaba')::uuid,
         md5('terengganu:vendor:guide-redang-pelangi-resort')::uuid
       );
  IF n <> 16 THEN RAISE EXCEPTION 'expected 16 Terengganu products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Terengganu'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Terengganu products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Terengganu';
  IF n <> 14 THEN RAISE EXCEPTION 'expected 14 Terengganu places (1 state + 3 regions + 10 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Terengganu';
  IF n <> 4 THEN RAISE EXCEPTION 'expected 4 Terengganu product_places links, found %', n; END IF;
END $$;

COMMIT;
;
