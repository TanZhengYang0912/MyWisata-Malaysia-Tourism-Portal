-- Selangor place model — seed data.
-- See docs/plans/2026-08-14-1930-selangor-real-business-seed.md
--
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real Selangor
-- (Klang, Shah Alam, Kuala Selangor) businesses sourced from OpenStreetMap
-- — © OpenStreetMap contributors, ODbL v1.0.
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, reviews, ratings, revenue
-- and wallet balances in the replay block are randomly generated demo
-- content for an academic project. They do not describe the real
-- businesses named here.
--
-- NO EXCEPTIONS: every vendor, outlet, name and coordinate below is real.
-- No dedicated "attraction operator" vendor this state — Taman Alam Kuala
-- Selangor (the firefly park) is Selangor state forestry-run with no
-- identifiable private operator, so it stays unmanaged/free (see plan D3).
--
-- category_id resolved once via c_food/c_activity/c_accommodation/c_retail.

BEGIN;

DO $$
DECLARE
  v_selangor uuid := md5('selangor:place:selangor')::uuid;
  v_klang uuid := md5('selangor:place:klang')::uuid;
  v_shah_alam uuid := md5('selangor:place:shah-alam')::uuid;
  v_kuala_selangor uuid := md5('selangor:place:kuala-selangor')::uuid;

  v_p_istana uuid := md5('selangor:place:istana-alam-shah')::uuid;
  v_p_kota_raja_mahadi uuid := md5('selangor:place:kota-raja-mahadi')::uuid;
  v_p_little_india uuid := md5('selangor:place:little-india-klang')::uuid;
  v_p_blue_mosque uuid := md5('selangor:place:blue-mosque')::uuid;
  v_p_lake_gardens uuid := md5('selangor:place:shah-alam-lake-gardens')::uuid;
  v_p_dataran_bunga_raya uuid := md5('selangor:place:dataran-bunga-raya')::uuid;
  v_p_bukit_melawati uuid := md5('selangor:place:bukit-melawati')::uuid;
  v_p_taman_alam uuid := md5('selangor:place:taman-alam-kuala-selangor')::uuid;
  v_p_pekan_lama uuid := md5('selangor:place:pekan-lama-kuala-selangor')::uuid;
  v_p_history_museum uuid := md5('selangor:place:kuala-selangor-history-museum')::uuid;

  v_v_seng_huat uuid := md5('selangor:vendor:food-seng-huat-bak-kut-teh')::uuid;
  v_v_chong_kok uuid := md5('selangor:vendor:food-chong-kok-kopitiam')::uuid;
  v_v_nan_feng uuid := md5('selangor:vendor:food-nan-feng-restoran')::uuid;

  v_v_dragon_art uuid := md5('selangor:vendor:retail-dragon-art-valley')::uuid;

  v_v_histana uuid := md5('selangor:vendor:accom-histana-hotel')::uuid;
  v_v_best_western uuid := md5('selangor:vendor:accom-best-western')::uuid;
  v_v_twenty_trees uuid := md5('selangor:vendor:accom-twenty-trees-boutique-hotel')::uuid;
  v_v_firefly_resort uuid := md5('selangor:vendor:accom-kuala-selangor-firefly-park-resort')::uuid;

  v_v_klang_valley_travel uuid := md5('selangor:vendor:guide-klang-valley-travel-tours')::uuid;
  v_v_flywind uuid := md5('selangor:vendor:guide-flywind-holidays')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_seng_huat uuid := md5('selangor:outlet:seng-huat-bak-kut-teh')::uuid;
  o_chong_kok uuid := md5('selangor:outlet:chong-kok-kopitiam')::uuid;
  o_nan_feng uuid := md5('selangor:outlet:nan-feng-restoran')::uuid;
  o_dragon_art uuid := md5('selangor:outlet:dragon-art-valley')::uuid;
  o_histana uuid := md5('selangor:outlet:histana-hotel')::uuid;
  o_best_western uuid := md5('selangor:outlet:best-western')::uuid;
  o_twenty_trees uuid := md5('selangor:outlet:twenty-trees-boutique-hotel')::uuid;
  o_firefly_resort uuid := md5('selangor:outlet:kuala-selangor-firefly-park-resort')::uuid;
  o_klang_valley_travel uuid := md5('selangor:outlet:klang-valley-travel-tours')::uuid;
  o_flywind uuid := md5('selangor:outlet:flywind-holidays')::uuid;

  p_senghuat_soup uuid := md5('selangor:product:senghuat-bak-kut-teh-set')::uuid;
  p_senghuat_rice uuid := md5('selangor:product:senghuat-claypot-rice')::uuid;
  p_chongkok_toast uuid := md5('selangor:product:chongkok-kaya-toast-set')::uuid;
  p_chongkok_coffee uuid := md5('selangor:product:chongkok-white-coffee')::uuid;
  p_nanfeng_noodle uuid := md5('selangor:product:nanfeng-wantan-mee')::uuid;
  p_nanfeng_rice uuid := md5('selangor:product:nanfeng-chicken-rice')::uuid;

  p_dragonart_craft uuid := md5('selangor:product:dragonart-craft-souvenir-set')::uuid;

  p_firefly_klangvalley uuid := md5('selangor:product:firefly-watching-tour-klangvalley')::uuid;
  p_firefly_flywind uuid := md5('selangor:product:firefly-mangrove-cruise-flywind')::uuid;

  p_histana_standard uuid := md5('selangor:product:histana-standard-room')::uuid;
  p_histana_deluxe uuid := md5('selangor:product:histana-deluxe-room')::uuid;
  p_bestwestern_room uuid := md5('selangor:product:bestwestern-room')::uuid;
  p_bestwestern_suite uuid := md5('selangor:product:bestwestern-suite')::uuid;
  p_twentytrees_standard uuid := md5('selangor:product:twentytrees-standard-room')::uuid;
  p_twentytrees_deluxe uuid := md5('selangor:product:twentytrees-deluxe-room')::uuid;
  p_fireflyresort_chalet uuid := md5('selangor:product:fireflyresort-riverview-chalet')::uuid;
  p_fireflyresort_family uuid := md5('selangor:product:fireflyresort-family-chalet')::uuid;

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
    (v_v_seng_huat, v_owner_ali, 'Restoran Seng Huat Bak Kut Teh', 'seng-huat-bak-kut-teh',
     'Bak kut teh restaurant in Klang.', 'food', 'approved', now()),
    (v_v_chong_kok, v_owner_raj, 'Chong Kok Kopitiam', 'chong-kok-kopitiam',
     'Kopitiam in Klang.', 'food', 'approved', now()),
    (v_v_nan_feng, v_owner_siti, 'Nan Feng Restoran', 'nan-feng-restoran',
     'Restaurant in Klang.', 'food', 'approved', now()),

    (v_v_dragon_art, v_owner_ali, 'Dragon Art Valley', 'dragon-art-valley',
     'Craft and art shop in Klang.', 'retail', 'approved', now()),

    (v_v_histana, v_owner_raj, 'Histana Hotel', 'histana-hotel',
     'Hotel in Klang.', 'accommodation', 'approved', now()),
    (v_v_best_western, v_owner_siti, 'Best Western', 'best-western-shah-alam',
     'Hotel in Shah Alam.', 'accommodation', 'approved', now()),
    (v_v_twenty_trees, v_owner_ali, 'Twenty Trees Boutique Hotel', 'twenty-trees-boutique-hotel',
     'Boutique hotel in Shah Alam.', 'accommodation', 'approved', now()),
    (v_v_firefly_resort, v_owner_raj, 'Kuala Selangor Firefly Park Resort', 'kuala-selangor-firefly-park-resort',
     'Chalet resort near the Kuala Selangor firefly park.', 'accommodation', 'approved', now()),

    (v_v_klang_valley_travel, v_owner_siti, 'Klang Valley Travel & Tours', 'klang-valley-travel-tours',
     'Licensed travel agency in Klang.', 'activity', 'approved', now()),
    (v_v_flywind, v_owner_ali, 'FLYWIND HOLIDAYS', 'flywind-holidays',
     'Licensed travel agency in Shah Alam.', 'activity', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_seng_huat, v_v_chong_kok, v_v_nan_feng, v_v_dragon_art,
    v_v_histana, v_v_best_western, v_v_twenty_trees, v_v_firefly_resort,
    v_v_klang_valley_travel, v_v_flywind
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_selangor, NULL, 'state', 'Selangor', 'selangor', 'Selangor', NULL, 3.0733, 101.5185, NULL, NULL, NULL),

    (v_klang, v_selangor, 'region', 'Klang', 'klang', 'Selangor', 'Klang', 3.0450, 101.4470, NULL, NULL, NULL),
    (v_shah_alam, v_selangor, 'region', 'Shah Alam', 'shah-alam', 'Selangor', 'Shah Alam', 3.0733, 101.5185, NULL, NULL, NULL),
    (v_kuala_selangor, v_selangor, 'region', 'Kuala Selangor', 'kuala-selangor', 'Selangor', 'Kuala Selangor', 3.3395, 101.2498, NULL, NULL, NULL),

    (v_p_istana, v_klang, 'poi', 'Istana Alam Shah', 'istana-alam-shah', 'Selangor', 'Klang', 3.037562, 101.451492, 0, NULL, NULL),
    (v_p_kota_raja_mahadi, v_klang, 'poi', 'Kota Raja Mahadi', 'kota-raja-mahadi', 'Selangor', 'Klang', 3.045050, 101.445083, 0, NULL, NULL),
    (v_p_little_india, v_klang, 'poi', 'Little India', 'little-india-klang', 'Selangor', 'Klang', 3.040365, 101.447003, 0, NULL, NULL),
    (v_p_blue_mosque, v_shah_alam, 'poi', 'Masjid Sultan Salahuddin Abdul Aziz Shah', 'blue-mosque', 'Selangor', 'Shah Alam', 3.079592, 101.520918, 0, NULL, NULL),
    (v_p_lake_gardens, v_shah_alam, 'poi', 'Taman Tasik Shah Alam', 'shah-alam-lake-gardens', 'Selangor', 'Shah Alam', 3.068923, 101.515786, 0, NULL, NULL),
    (v_p_dataran_bunga_raya, v_shah_alam, 'poi', 'Dataran Bunga Raya', 'dataran-bunga-raya', 'Selangor', 'Shah Alam', 3.076525, 101.521963, 0, NULL, NULL),
    (v_p_bukit_melawati, v_kuala_selangor, 'poi', 'Bukit Melawati Viewpoint', 'bukit-melawati', 'Selangor', 'Kuala Selangor', 3.341510, 101.244606, 0, NULL, NULL),
    (v_p_taman_alam, v_kuala_selangor, 'poi', 'Taman Alam Kuala Selangor', 'taman-alam-kuala-selangor', 'Selangor', 'Kuala Selangor', 3.333721, 101.240852, 0, NULL, NULL),
    (v_p_pekan_lama, v_kuala_selangor, 'poi', 'Pekan Lama Kuala Selangor', 'pekan-lama-kuala-selangor', 'Selangor', 'Kuala Selangor', 3.339522, 101.249833, 0, NULL, NULL),
    (v_p_history_museum, v_kuala_selangor, 'poi', 'Muzium Sejarah Daerah Kuala Selangor', 'kuala-selangor-history-museum', 'Selangor', 'Kuala Selangor', 3.341756, 101.245426, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_seng_huat, v_v_seng_huat, 'Restoran Seng Huat Bak Kut Teh', 'seng-huat-bak-kut-teh', NULL, 'Klang', 'Selangor', 3.043498, 101.448254),
    (o_chong_kok, v_v_chong_kok, 'Chong Kok Kopitiam', 'chong-kok-kopitiam', NULL, 'Klang', 'Selangor', 3.042552, 101.449615),
    (o_nan_feng, v_v_nan_feng, 'Nan Feng Restoran', 'nan-feng-restoran', NULL, 'Klang', 'Selangor', 3.051824, 101.448771),

    (o_dragon_art, v_v_dragon_art, 'Dragon Art Valley', 'dragon-art-valley', NULL, 'Klang', 'Selangor', 3.051725, 101.449195),

    (o_histana, v_v_histana, 'Histana Hotel', 'histana-hotel', NULL, 'Klang', 'Selangor', 3.051345, 101.462820),
    (o_best_western, v_v_best_western, 'Best Western', 'best-western-shah-alam', NULL, 'Shah Alam', 'Selangor', 3.066146, 101.485310),
    (o_twenty_trees, v_v_twenty_trees, 'Twenty Trees Boutique Hotel', 'twenty-trees-boutique-hotel', NULL, 'Shah Alam', 'Selangor', 3.051267, 101.539530),
    (o_firefly_resort, v_v_firefly_resort, 'Kuala Selangor Firefly Park Resort', 'kuala-selangor-firefly-park-resort', NULL, 'Kuala Selangor', 'Selangor', 3.386501, 101.279054),

    (o_klang_valley_travel, v_v_klang_valley_travel, 'Klang Valley Travel & Tours', 'klang-valley-travel-tours', NULL, 'Klang', 'Selangor', 3.050773, 101.449726),
    (o_flywind, v_v_flywind, 'FLYWIND HOLIDAYS', 'flywind-holidays', NULL, 'Shah Alam', 'Selangor', 3.076051, 101.550004)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_senghuat_soup, v_v_seng_huat, o_seng_huat, c_food, 'Bak Kut Teh Set', 'senghuat-bak-kut-teh-set', 'Herbal pork rib soup, served with rice.', 'food', false, 18.00),
    (p_senghuat_rice, v_v_seng_huat, o_seng_huat, c_food, 'Claypot Rice', 'senghuat-claypot-rice', 'Claypot rice with preserved meats.', 'food', false, 14.00),
    (p_chongkok_toast, v_v_chong_kok, o_chong_kok, c_food, 'Kaya Toast Set', 'chongkok-kaya-toast-set', 'Toast with kaya and soft-boiled eggs.', 'food', false, 8.00),
    (p_chongkok_coffee, v_v_chong_kok, o_chong_kok, c_food, 'White Coffee', 'chongkok-white-coffee', 'Local white coffee.', 'food', false, 5.00),
    (p_nanfeng_noodle, v_v_nan_feng, o_nan_feng, c_food, 'Wantan Mee', 'nanfeng-wantan-mee', 'Noodles with wantan dumplings and char siu.', 'food', false, 9.00),
    (p_nanfeng_rice, v_v_nan_feng, o_nan_feng, c_food, 'Chicken Rice', 'nanfeng-chicken-rice', 'Steamed chicken with fragrant rice.', 'food', false, 10.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_dragonart_craft, v_v_dragon_art, o_dragon_art, c_retail, 'Craft Souvenir Set', 'dragonart-craft-souvenir-set', 'Handmade craft souvenir set.', 'product', false, 38.00)
  ON CONFLICT (id) DO NOTHING;

  -- Guide services — outlet_id NULL, place-bound only. Real vendors (2
  -- licensed Klang Valley travel agencies), plausible itinerary names — see plan D8.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_firefly_klangvalley, v_v_klang_valley_travel, NULL, c_activity, 'Kuala Selangor Firefly Watching Tour', 'firefly-watching-tour-klangvalley', 'Evening boat tour to watch synchronous fireflies.', 'experience', true, 55.00),
    (p_firefly_flywind, v_v_flywind, NULL, c_activity, 'Firefly & Mangrove River Cruise', 'firefly-mangrove-cruise-flywind', 'Mangrove river cruise with firefly viewing.', 'experience', true, 65.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_histana_standard, v_v_histana, o_histana, c_accommodation, 'Standard Room', 'histana-standard-room', 'Standard room at Histana Hotel.', 'service', true, 90.00),
    (p_histana_deluxe, v_v_histana, o_histana, c_accommodation, 'Deluxe Room', 'histana-deluxe-room', 'Deluxe room at Histana Hotel.', 'service', true, 130.00),
    (p_bestwestern_room, v_v_best_western, o_best_western, c_accommodation, 'Deluxe Room', 'bestwestern-room', 'Deluxe room at Best Western Shah Alam.', 'service', true, 180.00),
    (p_bestwestern_suite, v_v_best_western, o_best_western, c_accommodation, 'Suite', 'bestwestern-suite', 'Suite at Best Western Shah Alam.', 'service', true, 280.00),
    (p_twentytrees_standard, v_v_twenty_trees, o_twenty_trees, c_accommodation, 'Standard Room', 'twentytrees-standard-room', 'Standard room at Twenty Trees Boutique Hotel.', 'service', true, 140.00),
    (p_twentytrees_deluxe, v_v_twenty_trees, o_twenty_trees, c_accommodation, 'Deluxe Room', 'twentytrees-deluxe-room', 'Deluxe room at Twenty Trees Boutique Hotel.', 'service', true, 190.00),
    (p_fireflyresort_chalet, v_v_firefly_resort, o_firefly_resort, c_accommodation, 'Riverview Chalet', 'fireflyresort-riverview-chalet', 'Riverview chalet at Kuala Selangor Firefly Park Resort.', 'service', true, 160.00),
    (p_fireflyresort_family, v_v_firefly_resort, o_firefly_resort, c_accommodation, 'Family Chalet', 'fireflyresort-family-chalet', 'Family chalet at Kuala Selangor Firefly Park Resort.', 'service', true, 240.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('selangor:variant:histana-standard')::uuid, p_histana_standard, 'Room Only', 0, true),
    (md5('selangor:variant:histana-deluxe')::uuid, p_histana_deluxe, 'Room Only', 0, true),
    (md5('selangor:variant:bestwestern-room')::uuid, p_bestwestern_room, 'Room Only', 0, true),
    (md5('selangor:variant:bestwestern-suite')::uuid, p_bestwestern_suite, 'Room Only', 0, true),
    (md5('selangor:variant:twentytrees-standard')::uuid, p_twentytrees_standard, 'Room Only', 0, true),
    (md5('selangor:variant:twentytrees-deluxe')::uuid, p_twentytrees_deluxe, 'Room Only', 0, true),
    (md5('selangor:variant:fireflyresort-chalet')::uuid, p_fireflyresort_chalet, 'Room Only', 0, true),
    (md5('selangor:variant:fireflyresort-family')::uuid, p_fireflyresort_family, 'Room Only', 0, true),
    (md5('selangor:variant:dragonart-craft')::uuid, p_dragonart_craft, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_dragonart_craft)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_firefly_klangvalley, v_p_taman_alam, 'guide_service'),
    (p_firefly_flywind, v_p_taman_alam, 'guide_service'),
    (p_dragonart_craft, v_p_little_india, 'addon')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- Historical replay — fabricated demo data attached to real business
  -- names. Excludes the 2 guide products (outlet_id IS NULL). 2 orders per
  -- food product, 1 per accommodation/retail product.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-SL-SEED') THEN

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
          (p_senghuat_soup, v_v_seng_huat, o_seng_huat, 'Bak Kut Teh Set', 18.00::numeric, false, 2),
          (p_senghuat_rice, v_v_seng_huat, o_seng_huat, 'Claypot Rice', 14.00::numeric, false, 2),
          (p_chongkok_toast, v_v_chong_kok, o_chong_kok, 'Kaya Toast Set', 8.00::numeric, false, 2),
          (p_chongkok_coffee, v_v_chong_kok, o_chong_kok, 'White Coffee', 5.00::numeric, false, 2),
          (p_nanfeng_noodle, v_v_nan_feng, o_nan_feng, 'Wantan Mee', 9.00::numeric, false, 2),
          (p_nanfeng_rice, v_v_nan_feng, o_nan_feng, 'Chicken Rice', 10.00::numeric, false, 2),

          (p_dragonart_craft, v_v_dragon_art, o_dragon_art, 'Craft Souvenir Set', 38.00::numeric, false, 1),

          (p_histana_standard, v_v_histana, o_histana, 'Standard Room', 90.00::numeric, true, 1),
          (p_histana_deluxe, v_v_histana, o_histana, 'Deluxe Room', 130.00::numeric, true, 1),
          (p_bestwestern_room, v_v_best_western, o_best_western, 'Deluxe Room', 180.00::numeric, true, 1),
          (p_bestwestern_suite, v_v_best_western, o_best_western, 'Suite', 280.00::numeric, true, 1),
          (p_twentytrees_standard, v_v_twenty_trees, o_twenty_trees, 'Standard Room', 140.00::numeric, true, 1),
          (p_twentytrees_deluxe, v_v_twenty_trees, o_twenty_trees, 'Deluxe Room', 190.00::numeric, true, 1),
          (p_fireflyresort_chalet, v_v_firefly_resort, o_firefly_resort, 'Riverview Chalet', 160.00::numeric, true, 1),
          (p_fireflyresort_family, v_v_firefly_resort, o_firefly_resort, 'Family Chalet', 240.00::numeric, true, 1)
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
            UPDATE orders SET display_id = 'ORD-SL-SEED' WHERE id = v_order_id;
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
    SELECT vendor_id FROM outlets WHERE state = 'Selangor');
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Selangor vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Selangor';
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Selangor outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE v.id IN (SELECT vendor_id FROM outlets WHERE state = 'Selangor')
       OR v.id IN (
         md5('selangor:vendor:guide-klang-valley-travel-tours')::uuid,
         md5('selangor:vendor:guide-flywind-holidays')::uuid
       );
  IF n <> 17 THEN RAISE EXCEPTION 'expected 17 Selangor products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Selangor'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Selangor products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Selangor';
  IF n <> 14 THEN RAISE EXCEPTION 'expected 14 Selangor places (1 state + 3 regions + 10 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Selangor';
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 Selangor product_places links, found %', n; END IF;
END $$;

COMMIT;
;
