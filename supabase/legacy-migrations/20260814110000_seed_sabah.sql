-- Sabah place model — seed data.
-- See docs/plans/2026-08-14-1650-sabah-real-business-seed.md
--
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real Sabah
-- (Kota Kinabalu, Ranau, Tuaran, Tanjung Aru) businesses sourced from
-- OpenStreetMap — © OpenStreetMap contributors, ODbL v1.0.
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, reviews, ratings, revenue
-- and wallet balances in the replay block are randomly generated demo
-- content for an academic project. They do not describe the real
-- businesses named here.
--
-- NO EXCEPTIONS: every vendor, outlet, name and coordinate below is real.
-- Mari Mari Cultural Village's operator company was not resolvable via
-- OSM, so the attraction itself (a real, OSM-tagged tourism=museum node)
-- is used directly as the vendor rather than guessing an operator name
-- (see plan D3).
--
-- category_id resolved once via c_food/c_activity/c_accommodation/c_retail.

BEGIN;

DO $$
DECLARE
  v_sabah uuid := md5('sabah:place:sabah')::uuid;
  v_kota_kinabalu uuid := md5('sabah:place:kota-kinabalu')::uuid;
  v_ranau uuid := md5('sabah:place:ranau')::uuid;
  v_tuaran uuid := md5('sabah:place:tuaran')::uuid;
  v_tanjung_aru uuid := md5('sabah:place:tanjung-aru')::uuid;

  v_p_kinabalu_park uuid := md5('sabah:place:kinabalu-park')::uuid;
  v_p_museum uuid := md5('sabah:place:sabah-state-museum')::uuid;
  v_p_signal_hill uuid := md5('sabah:place:signal-hill-observatory')::uuid;
  v_p_gaya_street uuid := md5('sabah:place:gaya-street-market')::uuid;
  v_p_jesselton uuid := md5('sabah:place:jesselton-point')::uuid;
  v_p_orkid uuid := md5('sabah:place:pusat-orkid')::uuid;
  v_p_city_mosque uuid := md5('sabah:place:kk-city-mosque')::uuid;
  v_p_mari_mari uuid := md5('sabah:place:mari-mari-cultural-village')::uuid;
  v_p_tanjung_aru_beach uuid := md5('sabah:place:tanjung-aru-beach')::uuid;
  v_p_tar_marine_park uuid := md5('sabah:place:tar-marine-park')::uuid;

  v_v_kobe uuid := md5('sabah:vendor:food-kobe-sizzlers')::uuid;
  v_v_welcome_seafood uuid := md5('sabah:vendor:food-welcome-seafood-restaurant')::uuid;
  v_v_foo_phing uuid := md5('sabah:vendor:food-foo-phing-dim-sum')::uuid;

  v_v_saltxpaper uuid := md5('sabah:vendor:retail-salt-x-paper')::uuid;

  v_v_jesselton_hotel uuid := md5('sabah:vendor:accom-the-jesselton-hotel')::uuid;
  v_v_pacific_sutera uuid := md5('sabah:vendor:accom-the-pacific-sutera')::uuid;
  v_v_shangrila_tanjung_aru uuid := md5('sabah:vendor:accom-shangrila-tanjung-aru')::uuid;

  v_v_sticky_rice uuid := md5('sabah:vendor:guide-sticky-rice-travel')::uuid;
  v_v_go_aquatic uuid := md5('sabah:vendor:guide-go-aquatic-diving')::uuid;

  v_v_mari_mari uuid := md5('sabah:vendor:op-mari-mari-cultural-village')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_kobe uuid := md5('sabah:outlet:kobe-sizzlers')::uuid;
  o_welcome_seafood uuid := md5('sabah:outlet:welcome-seafood-restaurant')::uuid;
  o_foo_phing uuid := md5('sabah:outlet:foo-phing-dim-sum')::uuid;
  o_saltxpaper uuid := md5('sabah:outlet:salt-x-paper')::uuid;
  o_jesselton_hotel uuid := md5('sabah:outlet:the-jesselton-hotel')::uuid;
  o_pacific_sutera uuid := md5('sabah:outlet:the-pacific-sutera')::uuid;
  o_shangrila_tanjung_aru uuid := md5('sabah:outlet:shangrila-tanjung-aru')::uuid;
  o_sticky_rice uuid := md5('sabah:outlet:sticky-rice-travel')::uuid;
  o_go_aquatic uuid := md5('sabah:outlet:go-aquatic-diving')::uuid;
  o_mari_mari uuid := md5('sabah:outlet:mari-mari-cultural-village')::uuid;

  p_kobe_sizzler uuid := md5('sabah:product:kobe-beef-sizzler')::uuid;
  p_kobe_pepper uuid := md5('sabah:product:kobe-black-pepper-sizzler')::uuid;
  p_welcome_crab uuid := md5('sabah:product:welcome-butter-crab')::uuid;
  p_welcome_prawn uuid := md5('sabah:product:welcome-salted-egg-prawn')::uuid;
  p_foophing_char_siu uuid := md5('sabah:product:foophing-char-siu-bao')::uuid;
  p_foophing_har_gow uuid := md5('sabah:product:foophing-har-gow')::uuid;

  p_saltxpaper_giftbox uuid := md5('sabah:product:saltxpaper-sabah-gift-box')::uuid;

  p_tar_islandhop uuid := md5('sabah:product:tar-marine-park-island-hopping')::uuid;
  p_tar_snorkel uuid := md5('sabah:product:tar-marine-park-snorkel-dive-trip')::uuid;

  p_marimari_ticket uuid := md5('sabah:product:marimari-entry-show-ticket')::uuid;

  p_jesselton_standard uuid := md5('sabah:product:jesselton-standard-room')::uuid;
  p_jesselton_deluxe uuid := md5('sabah:product:jesselton-deluxe-room')::uuid;
  p_pacificsutera_room uuid := md5('sabah:product:pacificsutera-room')::uuid;
  p_pacificsutera_suite uuid := md5('sabah:product:pacificsutera-suite')::uuid;
  p_shangrila_garden uuid := md5('sabah:product:shangrila-garden-room')::uuid;
  p_shangrila_seaview uuid := md5('sabah:product:shangrila-seaview-room')::uuid;

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
    (v_v_kobe, v_owner_ali, 'Kobe Sizzlers', 'kobe-sizzlers',
     'Sizzler restaurant in Kota Kinabalu.', 'food', 'approved', now()),
    (v_v_welcome_seafood, v_owner_raj, 'Welcome Seafood Restaurant', 'welcome-seafood-restaurant',
     'Seafood restaurant in Kota Kinabalu.', 'food', 'approved', now()),
    (v_v_foo_phing, v_owner_siti, 'Foo Phing Dim Sum', 'foo-phing-dim-sum',
     'Dim sum restaurant in Kota Kinabalu.', 'food', 'approved', now()),

    (v_v_saltxpaper, v_owner_ali, 'salt x paper', 'salt-x-paper',
     'Gift shop on Gaya Street, Kota Kinabalu.', 'retail', 'approved', now()),

    (v_v_jesselton_hotel, v_owner_raj, 'The Jesselton Hotel', 'the-jesselton-hotel',
     'Heritage hotel in Kota Kinabalu.', 'accommodation', 'approved', now()),
    (v_v_pacific_sutera, v_owner_siti, 'The Pacific Sutera', 'the-pacific-sutera',
     'Resort hotel in Kota Kinabalu.', 'accommodation', 'approved', now()),
    (v_v_shangrila_tanjung_aru, v_owner_ali, 'Shangri La''s Tanjung Aru Resort & Spa', 'shangrila-tanjung-aru',
     'Beach resort in Tanjung Aru.', 'accommodation', 'approved', now()),

    (v_v_sticky_rice, v_owner_raj, 'Sticky Rice Travel', 'sticky-rice-travel',
     'Licensed travel agency in Kota Kinabalu.', 'activity', 'approved', now()),
    (v_v_go_aquatic, v_owner_siti, 'Go Aquatic Diving', 'go-aquatic-diving',
     'Licensed dive operator in Kota Kinabalu.', 'activity', 'approved', now()),

    (v_v_mari_mari, v_owner_ali, 'Mari Mari Cultural Village', 'mari-mari-cultural-village',
     'Cultural village and living-museum experience in Tuaran.', 'attraction', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_kobe, v_v_welcome_seafood, v_v_foo_phing, v_v_saltxpaper,
    v_v_jesselton_hotel, v_v_pacific_sutera, v_v_shangrila_tanjung_aru,
    v_v_sticky_rice, v_v_go_aquatic, v_v_mari_mari
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_sabah, NULL, 'state', 'Sabah', 'sabah', 'Sabah', NULL, 5.9749, 116.0724, NULL, NULL, NULL),

    (v_kota_kinabalu, v_sabah, 'region', 'Kota Kinabalu', 'kota-kinabalu', 'Sabah', 'Kota Kinabalu', 5.9749, 116.0724, NULL, NULL, NULL),
    (v_ranau, v_sabah, 'region', 'Ranau', 'ranau', 'Sabah', 'Ranau', 6.0057, 116.5425, NULL, NULL, NULL),
    (v_tuaran, v_sabah, 'region', 'Tuaran', 'tuaran', 'Sabah', 'Tuaran', 5.9737, 116.2038, NULL, NULL, NULL),
    (v_tanjung_aru, v_sabah, 'region', 'Tanjung Aru', 'tanjung-aru', 'Sabah', 'Tanjung Aru', 5.9556, 116.0421, NULL, NULL, NULL),

    (v_p_kinabalu_park, v_ranau, 'poi', 'Kinabalu Park', 'kinabalu-park', 'Sabah', 'Ranau', 6.005670, 116.542450, 0, NULL, NULL),
    (v_p_museum, v_kota_kinabalu, 'poi', 'Sabah State Museum & Heritage Village', 'sabah-state-museum', 'Sabah', 'Kota Kinabalu', 5.960551, 116.071455, 0, NULL, NULL),
    (v_p_signal_hill, v_kota_kinabalu, 'poi', 'Signal Hill Observatory Tower', 'signal-hill-observatory', 'Sabah', 'Kota Kinabalu', 5.985638, 116.079104, 0, NULL, NULL),
    (v_p_gaya_street, v_kota_kinabalu, 'poi', 'Gaya Street Sunday Market', 'gaya-street-market', 'Sabah', 'Kota Kinabalu', 5.983565, 116.077003, 0, NULL, NULL),
    (v_p_jesselton, v_kota_kinabalu, 'poi', 'Jesselton Point', 'jesselton-point', 'Sabah', 'Kota Kinabalu', 5.990235, 116.079070, 0, NULL, NULL),
    (v_p_orkid, v_kota_kinabalu, 'poi', 'Pusat Orkid', 'pusat-orkid', 'Sabah', 'Kota Kinabalu', 5.961662, 116.071783, 0, NULL, NULL),
    (v_p_city_mosque, v_kota_kinabalu, 'poi', 'Kota Kinabalu City Mosque', 'kk-city-mosque', 'Sabah', 'Kota Kinabalu', 5.995787, 116.107715, 0, NULL, NULL),
    (v_p_mari_mari, v_tuaran, 'poi', 'Mari Mari Cultural Village', 'mari-mari-cultural-village', 'Sabah', 'Tuaran', 5.973711, 116.203843, 190.00, v_v_mari_mari, NULL),
    (v_p_tanjung_aru_beach, v_tanjung_aru, 'poi', 'Tanjung Aru Beach', 'tanjung-aru-beach', 'Sabah', 'Tanjung Aru', 5.952702, 116.042734, 0, NULL, NULL),
    (v_p_tar_marine_park, v_tanjung_aru, 'poi', 'Tunku Abdul Rahman Marine Park', 'tar-marine-park', 'Sabah', 'Tanjung Aru', 5.974180, 116.001906, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_kobe, v_v_kobe, 'Kobe Sizzlers', 'kobe-sizzlers', NULL, 'Kota Kinabalu', 'Sabah', 5.979519, 116.071394),
    (o_welcome_seafood, v_v_welcome_seafood, 'Welcome Seafood Restaurant', 'welcome-seafood-restaurant', NULL, 'Kota Kinabalu', 'Sabah', 5.974845, 116.072926),
    (o_foo_phing, v_v_foo_phing, 'Foo Phing Dim Sum', 'foo-phing-dim-sum', NULL, 'Kota Kinabalu', 'Sabah', 5.949293, 116.092178),

    (o_saltxpaper, v_v_saltxpaper, 'salt x paper', 'salt-x-paper', NULL, 'Kota Kinabalu', 'Sabah', 5.983689, 116.077903),

    (o_jesselton_hotel, v_v_jesselton_hotel, 'The Jesselton Hotel', 'the-jesselton-hotel', NULL, 'Kota Kinabalu', 'Sabah', 5.984842, 116.077844),
    (o_pacific_sutera, v_v_pacific_sutera, 'The Pacific Sutera', 'the-pacific-sutera', NULL, 'Kota Kinabalu', 'Sabah', 5.965472, 116.056563),
    (o_shangrila_tanjung_aru, v_v_shangrila_tanjung_aru, 'Shangri La''s Tanjung Aru Resort & Spa', 'shangrila-tanjung-aru', NULL, 'Tanjung Aru', 'Sabah', 5.955622, 116.042090),

    (o_sticky_rice, v_v_sticky_rice, 'Sticky Rice Travel', 'sticky-rice-travel', NULL, 'Kota Kinabalu', 'Sabah', 5.982238, 116.076195),
    (o_go_aquatic, v_v_go_aquatic, 'Go Aquatic Diving', 'go-aquatic-diving', NULL, 'Kota Kinabalu', 'Sabah', 5.986089, 116.076777),

    (o_mari_mari, v_v_mari_mari, 'Mari Mari Cultural Village', 'mari-mari-cultural-village', NULL, 'Tuaran', 'Sabah', 5.973711, 116.203843)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_kobe_sizzler, v_v_kobe, o_kobe, c_food, 'Beef Sizzler', 'kobe-beef-sizzler', 'Sizzling beef steak with gravy.', 'food', false, 22.00),
    (p_kobe_pepper, v_v_kobe, o_kobe, c_food, 'Black Pepper Chicken Sizzler', 'kobe-black-pepper-sizzler', 'Sizzling chicken in black pepper sauce.', 'food', false, 18.00),
    (p_welcome_crab, v_v_welcome_seafood, o_welcome_seafood, c_food, 'Butter Crab', 'welcome-butter-crab', 'Mud crab fried in a butter curry-leaf sauce.', 'food', false, 78.00),
    (p_welcome_prawn, v_v_welcome_seafood, o_welcome_seafood, c_food, 'Salted Egg Prawn', 'welcome-salted-egg-prawn', 'Prawns fried in salted egg yolk sauce.', 'food', false, 42.00),
    (p_foophing_char_siu, v_v_foo_phing, o_foo_phing, c_food, 'Char Siu Bao', 'foophing-char-siu-bao', 'Steamed barbecue pork bun.', 'food', false, 6.50),
    (p_foophing_har_gow, v_v_foo_phing, o_foo_phing, c_food, 'Har Gow', 'foophing-har-gow', 'Steamed prawn dumplings.', 'food', false, 8.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_saltxpaper_giftbox, v_v_saltxpaper, o_saltxpaper, c_retail, 'Sabah Gift Box', 'saltxpaper-sabah-gift-box', 'Curated box of Sabah-made paper and craft goods.', 'product', false, 48.00)
  ON CONFLICT (id) DO NOTHING;

  -- Guide services — outlet_id NULL, place-bound only. Real vendors (2
  -- licensed KK travel/dive agencies), plausible itinerary names — see plan D8.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_tar_islandhop, v_v_sticky_rice, NULL, c_activity, 'TAR Marine Park Island Hopping', 'tar-marine-park-island-hopping', 'Boat tour to Pulau Manukan and neighbouring islands.', 'experience', true, 120.00),
    (p_tar_snorkel, v_v_go_aquatic, NULL, c_activity, 'TAR Marine Park Snorkel & Dive Trip', 'tar-marine-park-snorkel-dive-trip', 'Snorkelling and dive trip in the Tunku Abdul Rahman Marine Park.', 'experience', true, 180.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_marimari_ticket, v_v_mari_mari, o_mari_mari, c_activity, 'Entry & Show Ticket', 'marimari-entry-show-ticket', 'Village tour, cultural performance and dinner at Mari Mari Cultural Village.', 'activity', true, 190.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_jesselton_standard, v_v_jesselton_hotel, o_jesselton_hotel, c_accommodation, 'Standard Room', 'jesselton-standard-room', 'Standard room at The Jesselton Hotel.', 'service', true, 220.00),
    (p_jesselton_deluxe, v_v_jesselton_hotel, o_jesselton_hotel, c_accommodation, 'Deluxe Room', 'jesselton-deluxe-room', 'Deluxe room at The Jesselton Hotel.', 'service', true, 320.00),
    (p_pacificsutera_room, v_v_pacific_sutera, o_pacific_sutera, c_accommodation, 'Deluxe Room', 'pacificsutera-room', 'Deluxe room at The Pacific Sutera.', 'service', true, 280.00),
    (p_pacificsutera_suite, v_v_pacific_sutera, o_pacific_sutera, c_accommodation, 'Suite', 'pacificsutera-suite', 'Suite at The Pacific Sutera.', 'service', true, 450.00),
    (p_shangrila_garden, v_v_shangrila_tanjung_aru, o_shangrila_tanjung_aru, c_accommodation, 'Garden Wing Room', 'shangrila-garden-room', 'Garden wing room at Shangri-La''s Tanjung Aru Resort.', 'service', true, 480.00),
    (p_shangrila_seaview, v_v_shangrila_tanjung_aru, o_shangrila_tanjung_aru, c_accommodation, 'Sea View Room', 'shangrila-seaview-room', 'Sea-view room at Shangri-La''s Tanjung Aru Resort.', 'service', true, 620.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('sabah:variant:jesselton-standard')::uuid, p_jesselton_standard, 'Room Only', 0, true),
    (md5('sabah:variant:jesselton-deluxe')::uuid, p_jesselton_deluxe, 'Room Only', 0, true),
    (md5('sabah:variant:pacificsutera-room')::uuid, p_pacificsutera_room, 'Room Only', 0, true),
    (md5('sabah:variant:pacificsutera-suite')::uuid, p_pacificsutera_suite, 'Room Only', 0, true),
    (md5('sabah:variant:shangrila-garden')::uuid, p_shangrila_garden, 'Room Only', 0, true),
    (md5('sabah:variant:shangrila-seaview')::uuid, p_shangrila_seaview, 'Room Only', 0, true),
    (md5('sabah:variant:saltxpaper-giftbox')::uuid, p_saltxpaper_giftbox, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_saltxpaper_giftbox)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_tar_islandhop, v_p_tar_marine_park, 'guide_service'),
    (p_tar_snorkel, v_p_tar_marine_park, 'guide_service'),
    (p_marimari_ticket, v_p_mari_mari, 'admission'),
    (p_saltxpaper_giftbox, v_p_gaya_street, 'addon')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- Historical replay — fabricated demo data attached to real business
  -- names. Excludes the 2 guide products (outlet_id IS NULL). 2 orders per
  -- food/attraction product, 1 per accommodation/retail product.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-SB-SEED') THEN

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
          (p_kobe_sizzler, v_v_kobe, o_kobe, 'Beef Sizzler', 22.00::numeric, false, 2),
          (p_kobe_pepper, v_v_kobe, o_kobe, 'Black Pepper Chicken Sizzler', 18.00::numeric, false, 2),
          (p_welcome_crab, v_v_welcome_seafood, o_welcome_seafood, 'Butter Crab', 78.00::numeric, false, 2),
          (p_welcome_prawn, v_v_welcome_seafood, o_welcome_seafood, 'Salted Egg Prawn', 42.00::numeric, false, 2),
          (p_foophing_char_siu, v_v_foo_phing, o_foo_phing, 'Char Siu Bao', 6.50::numeric, false, 2),
          (p_foophing_har_gow, v_v_foo_phing, o_foo_phing, 'Har Gow', 8.00::numeric, false, 2),

          (p_marimari_ticket, v_v_mari_mari, o_mari_mari, 'Entry & Show Ticket', 190.00::numeric, true, 2),

          (p_saltxpaper_giftbox, v_v_saltxpaper, o_saltxpaper, 'Sabah Gift Box', 48.00::numeric, false, 1),

          (p_jesselton_standard, v_v_jesselton_hotel, o_jesselton_hotel, 'Standard Room', 220.00::numeric, true, 1),
          (p_jesselton_deluxe, v_v_jesselton_hotel, o_jesselton_hotel, 'Deluxe Room', 320.00::numeric, true, 1),
          (p_pacificsutera_room, v_v_pacific_sutera, o_pacific_sutera, 'Deluxe Room', 280.00::numeric, true, 1),
          (p_pacificsutera_suite, v_v_pacific_sutera, o_pacific_sutera, 'Suite', 450.00::numeric, true, 1),
          (p_shangrila_garden, v_v_shangrila_tanjung_aru, o_shangrila_tanjung_aru, 'Garden Wing Room', 480.00::numeric, true, 1),
          (p_shangrila_seaview, v_v_shangrila_tanjung_aru, o_shangrila_tanjung_aru, 'Sea View Room', 620.00::numeric, true, 1)
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
            UPDATE orders SET display_id = 'ORD-SB-SEED' WHERE id = v_order_id;
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
    SELECT vendor_id FROM outlets WHERE state = 'Sabah');
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Sabah vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Sabah';
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Sabah outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE v.id IN (SELECT vendor_id FROM outlets WHERE state = 'Sabah')
       OR v.id IN (
         md5('sabah:vendor:guide-sticky-rice-travel')::uuid,
         md5('sabah:vendor:guide-go-aquatic-diving')::uuid
       );
  IF n <> 16 THEN RAISE EXCEPTION 'expected 16 Sabah products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Sabah'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Sabah products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Sabah';
  IF n <> 15 THEN RAISE EXCEPTION 'expected 15 Sabah places (1 state + 4 regions + 10 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Sabah';
  IF n <> 4 THEN RAISE EXCEPTION 'expected 4 Sabah product_places links, found %', n; END IF;
END $$;

COMMIT;
