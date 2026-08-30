-- Kelantan place model — seed data (13th and final state for this goal).
-- See docs/plans/2026-08-14-2200-kelantan-real-business-seed.md
--
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real Kelantan
-- (Kota Bharu, Bachok, Tumpat) businesses sourced from OpenStreetMap
-- — © OpenStreetMap contributors, ODbL v1.0.
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, reviews, ratings, revenue
-- and wallet balances in the replay block are randomly generated demo
-- content for an academic project. They do not describe the real
-- businesses named here.
--
-- NO EXCEPTIONS: every vendor, outlet, name and coordinate below is real.
-- Istana Jahar is both the POI and its own vendor — a real state-run royal
-- museum with no separate on-site retailer identified in OSM (see plan D3).
--
-- category_id resolved once via c_food/c_activity/c_accommodation/c_retail.

BEGIN;

DO $$
DECLARE
  v_kelantan uuid := md5('kelantan:place:kelantan')::uuid;
  v_kota_bharu uuid := md5('kelantan:place:kota-bharu')::uuid;
  v_bachok uuid := md5('kelantan:place:bachok')::uuid;
  v_tumpat uuid := md5('kelantan:place:tumpat')::uuid;

  v_p_istanajahar uuid := md5('kelantan:place:istana-jahar')::uuid;
  v_p_istanabatu uuid := md5('kelantan:place:istana-batu')::uuid;
  v_p_bankkerapu uuid := md5('kelantan:place:bank-kerapu')::uuid;
  v_p_wauKite uuid := md5('kelantan:place:muzium-wau-kite')::uuid;
  v_p_kraftangan uuid := md5('kelantan:place:kampung-kraftangan')::uuid;
  v_p_chinatown uuid := md5('kelantan:place:chinatown-kota-bharu')::uuid;
  v_p_pantainami uuid := md5('kelantan:place:pantai-nami')::uuid;
  v_p_pantairama uuid := md5('kelantan:place:pantai-irama')::uuid;
  v_p_srituju uuid := md5('kelantan:place:pantai-sri-tujuh')::uuid;
  v_p_watphoti uuid := md5('kelantan:place:wat-photiwihan')::uuid;

  v_v_yati uuid := md5('kelantan:vendor:food-yati-ayam-percik')::uuid;
  v_v_cendolsarah uuid := md5('kelantan:vendor:food-restoran-cendol-sarah')::uuid;
  v_v_maheran uuid := md5('kelantan:vendor:food-maheran-laksa')::uuid;

  v_v_kelantansilk uuid := md5('kelantan:vendor:retail-kelantan-silk-store')::uuid;

  v_v_ibisstyles uuid := md5('kelantan:vendor:accom-ibis-styles-kota-bharu')::uuid;
  v_v_tunehotel uuid := md5('kelantan:vendor:accom-tune-hotel')::uuid;
  v_v_pasirbelanda uuid := md5('kelantan:vendor:accom-pasir-belanda')::uuid;

  v_v_teraju uuid := md5('kelantan:vendor:guide-teraju-travel-tours')::uuid;
  v_v_zarkasyi uuid := md5('kelantan:vendor:guide-zarkasyi-travel')::uuid;

  v_v_istanajahar uuid := md5('kelantan:vendor:attraction-istana-jahar')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_yati uuid := md5('kelantan:outlet:yati-ayam-percik')::uuid;
  o_cendolsarah uuid := md5('kelantan:outlet:restoran-cendol-sarah')::uuid;
  o_maheran uuid := md5('kelantan:outlet:maheran-laksa')::uuid;
  o_kelantansilk uuid := md5('kelantan:outlet:kelantan-silk-store')::uuid;
  o_ibisstyles uuid := md5('kelantan:outlet:ibis-styles-kota-bharu')::uuid;
  o_tunehotel uuid := md5('kelantan:outlet:tune-hotel')::uuid;
  o_pasirbelanda uuid := md5('kelantan:outlet:pasir-belanda')::uuid;
  o_teraju uuid := md5('kelantan:outlet:teraju-travel-tours')::uuid;
  o_zarkasyi uuid := md5('kelantan:outlet:zarkasyi-travel')::uuid;
  o_istanajahar uuid := md5('kelantan:outlet:istana-jahar')::uuid;

  p_yati_percik uuid := md5('kelantan:product:yati-ayam-percik-set')::uuid;
  p_yati_nasikerabu uuid := md5('kelantan:product:yati-nasi-kerabu')::uuid;
  p_cendolsarah_cendol uuid := md5('kelantan:product:cendolsarah-classic-cendol')::uuid;
  p_cendolsarah_durian uuid := md5('kelantan:product:cendolsarah-durian-cendol')::uuid;
  p_maheran_laksa uuid := md5('kelantan:product:maheran-laksa-kelantan')::uuid;
  p_maheran_laksam uuid := md5('kelantan:product:maheran-laksam')::uuid;

  p_kelantansilk_songket uuid := md5('kelantan:product:kelantansilk-songket-silk-set')::uuid;

  p_watphoti_teraju uuid := md5('kelantan:product:watphoti-temple-tour-teraju')::uuid;
  p_watphoti_zarkasyi uuid := md5('kelantan:product:watphoti-heritage-visit-zarkasyi')::uuid;

  p_istanajahar_ticket uuid := md5('kelantan:product:istanajahar-entry-ticket')::uuid;

  p_ibisstyles_standard uuid := md5('kelantan:product:ibisstyles-standard-room')::uuid;
  p_ibisstyles_superior uuid := md5('kelantan:product:ibisstyles-superior-room')::uuid;
  p_tunehotel_standard uuid := md5('kelantan:product:tunehotel-standard-room')::uuid;
  p_tunehotel_family uuid := md5('kelantan:product:tunehotel-family-room')::uuid;
  p_pasirbelanda_chalet uuid := md5('kelantan:product:pasirbelanda-garden-chalet')::uuid;
  p_pasirbelanda_deluxe uuid := md5('kelantan:product:pasirbelanda-deluxe-chalet')::uuid;

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
    (v_v_yati, v_owner_ali, 'Yati Ayam Percik', 'yati-ayam-percik',
     'Famous ayam percik restaurant in Kota Bharu.', 'food', 'approved', now()),
    (v_v_cendolsarah, v_owner_raj, 'Restoran Cendol Sarah', 'restoran-cendol-sarah',
     'Cendol dessert restaurant in Kota Bharu.', 'food', 'approved', now()),
    (v_v_maheran, v_owner_siti, 'Maheran Laksa', 'maheran-laksa',
     'Laksa restaurant in Kota Bharu.', 'food', 'approved', now()),

    (v_v_kelantansilk, v_owner_ali, 'Kelantan Silk Store', 'kelantan-silk-store',
     'Songket and silk fabric shop in Kota Bharu.', 'retail', 'approved', now()),

    (v_v_ibisstyles, v_owner_raj, 'Ibis Styles Kota Bharu', 'ibis-styles-kota-bharu',
     'International chain hotel in Kota Bharu city centre.', 'accommodation', 'approved', now()),
    (v_v_tunehotel, v_owner_siti, 'Tune Hotel', 'tune-hotel-kota-bharu',
     'Budget hotel chain branch in Kota Bharu.', 'accommodation', 'approved', now()),
    (v_v_pasirbelanda, v_owner_ali, 'Pasir Belanda', 'pasir-belanda',
     'Boutique resort near Pantai Cahaya Bulan, Kota Bharu.', 'accommodation', 'approved', now()),

    (v_v_teraju, v_owner_raj, 'Teraju Travel & Tours', 'teraju-travel-tours',
     'Licensed travel agency in Kota Bharu.', 'activity', 'approved', now()),
    (v_v_zarkasyi, v_owner_siti, 'Zarkasyi Travel', 'zarkasyi-travel',
     'Licensed travel agency in Kota Bharu.', 'activity', 'approved', now()),

    (v_v_istanajahar, v_owner_ali, 'Istana Jahar', 'istana-jahar-vendor',
     'Royal customs museum in a traditional Kelantanese palace.', 'attraction', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_yati, v_v_cendolsarah, v_v_maheran, v_v_kelantansilk,
    v_v_ibisstyles, v_v_tunehotel, v_v_pasirbelanda,
    v_v_teraju, v_v_zarkasyi, v_v_istanajahar
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_kelantan, NULL, 'state', 'Kelantan', 'kelantan', 'Kelantan', NULL, 6.1333, 102.2386, NULL, NULL, NULL),

    (v_kota_bharu, v_kelantan, 'region', 'Kota Bharu', 'kota-bharu', 'Kelantan', 'Kota Bharu', 6.1333, 102.2386, NULL, NULL, NULL),
    (v_bachok, v_kelantan, 'region', 'Bachok', 'bachok', 'Kelantan', 'Bachok', 6.0833, 102.4000, NULL, NULL, NULL),
    (v_tumpat, v_kelantan, 'region', 'Tumpat', 'tumpat', 'Kelantan', 'Tumpat', 6.2000, 102.1667, NULL, NULL, NULL),

    (v_p_istanajahar, v_kota_bharu, 'poi', 'Istana Jahar', 'istana-jahar', 'Kelantan', 'Kota Bharu', 6.131523, 102.237128, 4.00, v_v_istanajahar, NULL),
    (v_p_istanabatu, v_kota_bharu, 'poi', 'Istana Batu', 'istana-batu', 'Kelantan', 'Kota Bharu', 6.132116, 102.237319, 0, NULL, NULL),
    (v_p_bankkerapu, v_kota_bharu, 'poi', 'Bank Kerapu', 'bank-kerapu', 'Kelantan', 'Kota Bharu', 6.131868, 102.235483, 0, NULL, NULL),
    (v_p_wauKite, v_kota_bharu, 'poi', 'Muzium Wau Kite', 'muzium-wau-kite', 'Kelantan', 'Kota Bharu', 6.215673, 102.126605, 0, NULL, NULL),
    (v_p_kraftangan, v_kota_bharu, 'poi', 'Kampung Kraftangan', 'kampung-kraftangan', 'Kelantan', 'Kota Bharu', 6.132021, 102.237979, 0, NULL, NULL),
    (v_p_chinatown, v_kota_bharu, 'poi', 'Chinatown Kota Bharu', 'chinatown-kota-bharu', 'Kelantan', 'Kota Bharu', 6.131131, 102.243362, 0, NULL, NULL),
    (v_p_pantainami, v_bachok, 'poi', 'Pantai Nami', 'pantai-nami', 'Kelantan', 'Bachok', 6.163717, 102.346488, 0, NULL, NULL),
    (v_p_pantairama, v_bachok, 'poi', 'Pantai Irama', 'pantai-irama', 'Kelantan', 'Bachok', 6.077727, 102.394886, 0, NULL, NULL),
    (v_p_srituju, v_tumpat, 'poi', 'Pantai Sri Tujuh', 'pantai-sri-tujuh', 'Kelantan', 'Tumpat', 6.192673, 102.174473, 0, NULL, NULL),
    (v_p_watphoti, v_tumpat, 'poi', 'Wat Photiwihan', 'wat-photiwihan', 'Kelantan', 'Tumpat', 6.130242, 102.137635, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_yati, v_v_yati, 'Yati Ayam Percik', 'yati-ayam-percik', NULL, 'Kota Bharu', 'Kelantan', 6.128262, 102.256424),
    (o_cendolsarah, v_v_cendolsarah, 'Restoran Cendol Sarah', 'restoran-cendol-sarah', NULL, 'Kota Bharu', 'Kelantan', 6.126421, 102.241827),
    (o_maheran, v_v_maheran, 'Maheran Laksa', 'maheran-laksa', NULL, 'Kota Bharu', 'Kelantan', 6.114605, 102.230601),

    (o_kelantansilk, v_v_kelantansilk, 'Kelantan Silk Store', 'kelantan-silk-store', NULL, 'Kota Bharu', 'Kelantan', 6.128996, 102.240515),

    (o_ibisstyles, v_v_ibisstyles, 'Ibis Styles Kota Bharu', 'ibis-styles-kota-bharu', NULL, 'Kota Bharu', 'Kelantan', 6.122643, 102.234533),
    (o_tunehotel, v_v_tunehotel, 'Tune Hotel', 'tune-hotel-kota-bharu', NULL, 'Kota Bharu', 'Kelantan', 6.116878, 102.239575),
    (o_pasirbelanda, v_v_pasirbelanda, 'Pasir Belanda', 'pasir-belanda', NULL, 'Kota Bharu', 'Kelantan', 6.157795, 102.256624),

    (o_teraju, v_v_teraju, 'Teraju Travel & Tours', 'teraju-travel-tours', NULL, 'Kota Bharu', 'Kelantan', 6.134518, 102.305127),
    (o_zarkasyi, v_v_zarkasyi, 'Zarkasyi Travel', 'zarkasyi-travel', NULL, 'Kota Bharu', 'Kelantan', 6.109444, 102.255320),

    (o_istanajahar, v_v_istanajahar, 'Istana Jahar', 'istana-jahar', NULL, 'Kota Bharu', 'Kelantan', 6.131523, 102.237128)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_yati_percik, v_v_yati, o_yati, c_food, 'Ayam Percik Set', 'yati-ayam-percik-set', 'Grilled chicken in spiced coconut gravy, with rice.', 'food', false, 14.00),
    (p_yati_nasikerabu, v_v_yati, o_yati, c_food, 'Nasi Kerabu', 'yati-nasi-kerabu', 'Blue rice with herbs, salad and fried fish.', 'food', false, 10.00),
    (p_cendolsarah_cendol, v_v_cendolsarah, o_cendolsarah, c_food, 'Classic Cendol', 'cendolsarah-classic-cendol', 'Shaved ice dessert with pandan jelly and palm sugar.', 'food', false, 6.00),
    (p_cendolsarah_durian, v_v_cendolsarah, o_cendolsarah, c_food, 'Durian Cendol', 'cendolsarah-durian-cendol', 'Cendol topped with fresh durian.', 'food', false, 9.00),
    (p_maheran_laksa, v_v_maheran, o_maheran, c_food, 'Laksa Kelantan', 'maheran-laksa-kelantan', 'Thick rice noodles in spiced fish gravy.', 'food', false, 8.00),
    (p_maheran_laksam, v_v_maheran, o_maheran, c_food, 'Laksam', 'maheran-laksam', 'Rolled rice noodles in coconut fish gravy.', 'food', false, 8.50)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_kelantansilk_songket, v_v_kelantansilk, o_kelantansilk, c_retail, 'Songket Silk Set', 'kelantansilk-songket-silk-set', 'Handwoven songket silk fabric set.', 'product', false, 180.00)
  ON CONFLICT (id) DO NOTHING;

  -- Guide services — outlet_id NULL, place-bound only. Real vendors (2
  -- licensed Kota Bharu travel agencies), plausible itinerary names — see plan D8.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_watphoti_teraju, v_v_teraju, NULL, c_activity, 'Wat Photiwihan Temple Tour', 'watphoti-temple-tour-teraju', 'Guided visit to the reclining Buddha temple.', 'experience', true, 40.00),
    (p_watphoti_zarkasyi, v_v_zarkasyi, NULL, c_activity, 'Wat Photiwihan Heritage Visit', 'watphoti-heritage-visit-zarkasyi', 'Small-group heritage visit to Wat Photiwihan.', 'experience', true, 35.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_istanajahar_ticket, v_v_istanajahar, o_istanajahar, c_activity, 'Entry Ticket', 'istanajahar-entry-ticket', 'Admission to Istana Jahar royal customs museum.', 'experience', false, 4.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_ibisstyles_standard, v_v_ibisstyles, o_ibisstyles, c_accommodation, 'Standard Room', 'ibisstyles-standard-room', 'Standard room at Ibis Styles Kota Bharu.', 'service', true, 130.00),
    (p_ibisstyles_superior, v_v_ibisstyles, o_ibisstyles, c_accommodation, 'Superior Room', 'ibisstyles-superior-room', 'Superior room at Ibis Styles Kota Bharu.', 'service', true, 170.00),
    (p_tunehotel_standard, v_v_tunehotel, o_tunehotel, c_accommodation, 'Standard Room', 'tunehotel-standard-room', 'Standard room at Tune Hotel Kota Bharu.', 'service', true, 60.00),
    (p_tunehotel_family, v_v_tunehotel, o_tunehotel, c_accommodation, 'Family Room', 'tunehotel-family-room', 'Family room at Tune Hotel Kota Bharu.', 'service', true, 95.00),
    (p_pasirbelanda_chalet, v_v_pasirbelanda, o_pasirbelanda, c_accommodation, 'Garden Chalet', 'pasirbelanda-garden-chalet', 'Garden chalet at Pasir Belanda.', 'service', true, 150.00),
    (p_pasirbelanda_deluxe, v_v_pasirbelanda, o_pasirbelanda, c_accommodation, 'Deluxe Chalet', 'pasirbelanda-deluxe-chalet', 'Deluxe chalet at Pasir Belanda.', 'service', true, 210.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('kelantan:variant:ibisstyles-standard')::uuid, p_ibisstyles_standard, 'Room Only', 0, true),
    (md5('kelantan:variant:ibisstyles-superior')::uuid, p_ibisstyles_superior, 'Room Only', 0, true),
    (md5('kelantan:variant:tunehotel-standard')::uuid, p_tunehotel_standard, 'Room Only', 0, true),
    (md5('kelantan:variant:tunehotel-family')::uuid, p_tunehotel_family, 'Room Only', 0, true),
    (md5('kelantan:variant:pasirbelanda-chalet')::uuid, p_pasirbelanda_chalet, 'Room Only', 0, true),
    (md5('kelantan:variant:pasirbelanda-deluxe')::uuid, p_pasirbelanda_deluxe, 'Room Only', 0, true),
    (md5('kelantan:variant:istanajahar-ticket')::uuid, p_istanajahar_ticket, 'Standard', 0, true),
    (md5('kelantan:variant:kelantansilk-songket')::uuid, p_kelantansilk_songket, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_kelantansilk_songket)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_watphoti_teraju, v_p_watphoti, 'guide_service'),
    (p_watphoti_zarkasyi, v_p_watphoti, 'guide_service'),
    (p_istanajahar_ticket, v_p_istanajahar, 'admission'),
    (p_kelantansilk_songket, v_p_kraftangan, 'addon')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- Historical replay — fabricated demo data attached to real business
  -- names. Excludes the 2 guide products (outlet_id IS NULL). 2 orders per
  -- food/attraction product, 1 per accommodation/retail product.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-KEL-SEED') THEN

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
          (p_yati_percik, v_v_yati, o_yati, 'Ayam Percik Set', 14.00::numeric, false, 2),
          (p_yati_nasikerabu, v_v_yati, o_yati, 'Nasi Kerabu', 10.00::numeric, false, 2),
          (p_cendolsarah_cendol, v_v_cendolsarah, o_cendolsarah, 'Classic Cendol', 6.00::numeric, false, 2),
          (p_cendolsarah_durian, v_v_cendolsarah, o_cendolsarah, 'Durian Cendol', 9.00::numeric, false, 2),
          (p_maheran_laksa, v_v_maheran, o_maheran, 'Laksa Kelantan', 8.00::numeric, false, 2),
          (p_maheran_laksam, v_v_maheran, o_maheran, 'Laksam', 8.50::numeric, false, 2),

          (p_kelantansilk_songket, v_v_kelantansilk, o_kelantansilk, 'Songket Silk Set', 180.00::numeric, false, 1),

          (p_istanajahar_ticket, v_v_istanajahar, o_istanajahar, 'Entry Ticket', 4.00::numeric, false, 2),

          (p_ibisstyles_standard, v_v_ibisstyles, o_ibisstyles, 'Standard Room', 130.00::numeric, true, 1),
          (p_ibisstyles_superior, v_v_ibisstyles, o_ibisstyles, 'Superior Room', 170.00::numeric, true, 1),
          (p_tunehotel_standard, v_v_tunehotel, o_tunehotel, 'Standard Room', 60.00::numeric, true, 1),
          (p_tunehotel_family, v_v_tunehotel, o_tunehotel, 'Family Room', 95.00::numeric, true, 1),
          (p_pasirbelanda_chalet, v_v_pasirbelanda, o_pasirbelanda, 'Garden Chalet', 150.00::numeric, true, 1),
          (p_pasirbelanda_deluxe, v_v_pasirbelanda, o_pasirbelanda, 'Deluxe Chalet', 210.00::numeric, true, 1)
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
            UPDATE orders SET display_id = 'ORD-KEL-SEED' WHERE id = v_order_id;
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
    SELECT vendor_id FROM outlets WHERE state = 'Kelantan');
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Kelantan vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Kelantan';
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Kelantan outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE v.id IN (SELECT vendor_id FROM outlets WHERE state = 'Kelantan');
  IF n <> 16 THEN RAISE EXCEPTION 'expected 16 Kelantan products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Kelantan'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Kelantan products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Kelantan';
  IF n <> 14 THEN RAISE EXCEPTION 'expected 14 Kelantan places (1 state + 3 regions + 10 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Kelantan';
  IF n <> 4 THEN RAISE EXCEPTION 'expected 4 Kelantan product_places links, found %', n; END IF;
END $$;

COMMIT;
;
