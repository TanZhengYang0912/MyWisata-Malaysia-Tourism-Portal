-- Negeri Sembilan place model — seed data.
-- See docs/plans/2026-08-14-2100-negeri-sembilan-real-business-seed.md
--
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real Negeri
-- Sembilan (Seremban, Port Dickson, Sri Menanti) businesses sourced from
-- OpenStreetMap — © OpenStreetMap contributors, ODbL v1.0.
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, reviews, ratings, revenue
-- and wallet balances in the replay block are randomly generated demo
-- content for an academic project. They do not describe the real
-- businesses named here.
--
-- NO EXCEPTIONS: every vendor, outlet, name and coordinate below is real.
-- Muzium DiRaja Istana Lama Seri Menanti is both the POI and its own
-- vendor — a real state-run royal museum with no separate on-site
-- retailer identified in OSM (see plan D3).
--
-- category_id resolved once via c_food/c_activity/c_accommodation/c_retail.

BEGIN;

DO $$
DECLARE
  v_ns uuid := md5('negeri-sembilan:place:negeri-sembilan')::uuid;
  v_seremban uuid := md5('negeri-sembilan:place:seremban')::uuid;
  v_port_dickson uuid := md5('negeri-sembilan:place:port-dickson')::uuid;
  v_sri_menanti uuid := md5('negeri-sembilan:place:sri-menanti')::uuid;

  v_p_lakegarden uuid := md5('negeri-sembilan:place:seremban-lake-garden')::uuid;
  v_p_pasarbesar uuid := md5('negeri-sembilan:place:pasar-besar-seremban')::uuid;
  v_p_chineseassembly uuid := md5('negeri-sembilan:place:ns-chinese-assembly-hall')::uuid;
  v_p_tanjungtuan uuid := md5('negeri-sembilan:place:tanjung-tuan')::uuid;
  v_p_armymuseum uuid := md5('negeri-sembilan:place:pd-army-museum')::uuid;
  v_p_0kmpd uuid := md5('negeri-sembilan:place:0km-port-dickson')::uuid;
  v_p_kotalukut uuid := md5('negeri-sembilan:place:muzium-kota-lukut')::uuid;
  v_p_istanalama uuid := md5('negeri-sembilan:place:istana-lama-seri-menanti')::uuid;
  v_p_balairong uuid := md5('negeri-sembilan:place:balairong-seri')::uuid;
  v_p_makamdiraja uuid := md5('negeri-sembilan:place:makam-diraja-seri-menanti')::uuid;

  v_v_yeekee uuid := md5('negeri-sembilan:vendor:food-yee-kee-beef-noodles')::uuid;
  v_v_hoongkee uuid := md5('negeri-sembilan:vendor:food-restoran-hoong-kee')::uuid;
  v_v_lingams uuid := md5('negeri-sembilan:vendor:food-lingams-curry-house')::uuid;

  v_v_keemei uuid := md5('negeri-sembilan:vendor:retail-kee-mei-siew-pow')::uuid;

  v_v_palm uuid := md5('negeri-sembilan:vendor:accom-palm-seremban-hotel')::uuid;
  v_v_thistle uuid := md5('negeri-sembilan:vendor:accom-thistle-port-dickson')::uuid;
  v_v_lexis uuid := md5('negeri-sembilan:vendor:accom-lexis-hibiscus-port-dickson')::uuid;

  v_v_bagus uuid := md5('negeri-sembilan:vendor:guide-bagus-holiday')::uuid;
  v_v_ns_travel uuid := md5('negeri-sembilan:vendor:guide-seremban-travel-tours')::uuid;

  v_v_istanalama uuid := md5('negeri-sembilan:vendor:attraction-muzium-diraja-istana-lama-seri-menanti')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_yeekee uuid := md5('negeri-sembilan:outlet:yee-kee-beef-noodles')::uuid;
  o_hoongkee uuid := md5('negeri-sembilan:outlet:restoran-hoong-kee')::uuid;
  o_lingams uuid := md5('negeri-sembilan:outlet:lingams-curry-house')::uuid;
  o_keemei uuid := md5('negeri-sembilan:outlet:kee-mei-siew-pow')::uuid;
  o_palm uuid := md5('negeri-sembilan:outlet:palm-seremban-hotel')::uuid;
  o_thistle uuid := md5('negeri-sembilan:outlet:thistle-port-dickson')::uuid;
  o_lexis uuid := md5('negeri-sembilan:outlet:lexis-hibiscus-port-dickson')::uuid;
  o_bagus uuid := md5('negeri-sembilan:outlet:bagus-holiday')::uuid;
  o_ns_travel uuid := md5('negeri-sembilan:outlet:seremban-travel-tours')::uuid;
  o_istanalama uuid := md5('negeri-sembilan:outlet:muzium-diraja-istana-lama-seri-menanti')::uuid;

  p_yeekee_beefnoodle uuid := md5('negeri-sembilan:product:yeekee-beef-noodles')::uuid;
  p_yeekee_beefball uuid := md5('negeri-sembilan:product:yeekee-beef-ball-soup')::uuid;
  p_hoongkee_beefnoodle uuid := md5('negeri-sembilan:product:hoongkee-beef-noodles')::uuid;
  p_hoongkee_meehoon uuid := md5('negeri-sembilan:product:hoongkee-beef-meehoon-soup')::uuid;
  p_lingams_fishhead uuid := md5('negeri-sembilan:product:lingams-fish-head-curry')::uuid;
  p_lingams_briyani uuid := md5('negeri-sembilan:product:lingams-mutton-briyani')::uuid;

  p_keemei_siewpau uuid := md5('negeri-sembilan:product:keemei-siew-pau-box')::uuid;

  p_tanjungtuan_bagus uuid := md5('negeri-sembilan:product:tanjungtuan-eco-hike-bagus')::uuid;
  p_tanjungtuan_nstravel uuid := md5('negeri-sembilan:product:tanjungtuan-nature-trail-nstravel')::uuid;

  p_istanalama_ticket uuid := md5('negeri-sembilan:product:istanalama-entry-ticket')::uuid;

  p_palm_standard uuid := md5('negeri-sembilan:product:palm-standard-room')::uuid;
  p_palm_deluxe uuid := md5('negeri-sembilan:product:palm-deluxe-room')::uuid;
  p_thistle_standard uuid := md5('negeri-sembilan:product:thistle-standard-room')::uuid;
  p_thistle_seaview uuid := md5('negeri-sembilan:product:thistle-seaview-room')::uuid;
  p_lexis_villa uuid := md5('negeri-sembilan:product:lexis-hibiscus-villa')::uuid;
  p_lexis_pool uuid := md5('negeri-sembilan:product:lexis-private-pool-villa')::uuid;

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
    (v_v_yeekee, v_owner_ali, 'Yee Kee Beef Noodles', 'yee-kee-beef-noodles',
     'Famous Seremban beef noodle restaurant.', 'food', 'approved', now()),
    (v_v_hoongkee, v_owner_raj, 'Restoran Hoong Kee', 'restoran-hoong-kee',
     'Seremban beef noodle restaurant.', 'food', 'approved', now()),
    (v_v_lingams, v_owner_siti, 'Lingam''s Curry House', 'lingams-curry-house',
     'South Indian curry restaurant in Seremban.', 'food', 'approved', now()),

    (v_v_keemei, v_owner_ali, 'Kee Mei Siew Pow', 'kee-mei-siew-pow',
     'Heritage siew pau bakery in Seremban.', 'retail', 'approved', now()),

    (v_v_palm, v_owner_raj, 'Palm Seremban Hotel', 'palm-seremban-hotel',
     'Hotel in Seremban city centre.', 'accommodation', 'approved', now()),
    (v_v_thistle, v_owner_siti, 'Thistle Port Dickson', 'thistle-port-dickson',
     'Beachfront resort hotel in Port Dickson.', 'accommodation', 'approved', now()),
    (v_v_lexis, v_owner_ali, 'Lexis Hibiscus Port Dickson', 'lexis-hibiscus-port-dickson',
     'Resort with private-pool villas in Port Dickson.', 'accommodation', 'approved', now()),

    (v_v_bagus, v_owner_raj, 'Bagus Holiday', 'bagus-holiday',
     'Licensed travel agency in Seremban.', 'activity', 'approved', now()),
    (v_v_ns_travel, v_owner_siti, 'Seremban Travel & Tours', 'seremban-travel-tours',
     'Licensed travel agency in Seremban.', 'activity', 'approved', now()),

    (v_v_istanalama, v_owner_ali, 'Muzium DiRaja Istana Lama Seri Menanti', 'muzium-diraja-istana-lama-seri-menanti',
     'Royal museum in the old wooden palace at Sri Menanti.', 'attraction', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_yeekee, v_v_hoongkee, v_v_lingams, v_v_keemei,
    v_v_palm, v_v_thistle, v_v_lexis,
    v_v_bagus, v_v_ns_travel, v_v_istanalama
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_ns, NULL, 'state', 'Negeri Sembilan', 'negeri-sembilan', 'Negeri Sembilan', NULL, 2.7297, 101.9381, NULL, NULL, NULL),

    (v_seremban, v_ns, 'region', 'Seremban', 'seremban', 'Negeri Sembilan', 'Seremban', 2.7297, 101.9381, NULL, NULL, NULL),
    (v_port_dickson, v_ns, 'region', 'Port Dickson', 'port-dickson', 'Negeri Sembilan', 'Port Dickson', 2.5225, 101.7961, NULL, NULL, NULL),
    (v_sri_menanti, v_ns, 'region', 'Sri Menanti', 'sri-menanti', 'Negeri Sembilan', 'Kuala Pilah', 2.6980, 102.1580, NULL, NULL, NULL),

    (v_p_lakegarden, v_seremban, 'poi', 'Seremban Lake Garden Park', 'seremban-lake-garden', 'Negeri Sembilan', 'Seremban', 2.722486, 101.947189, 0, NULL, NULL),
    (v_p_pasarbesar, v_seremban, 'poi', 'Pasar Besar Seremban', 'pasar-besar-seremban', 'Negeri Sembilan', 'Seremban', 2.730712, 101.936622, 0, NULL, NULL),
    (v_p_chineseassembly, v_seremban, 'poi', 'Negeri Sembilan Chinese Assembly Hall', 'ns-chinese-assembly-hall', 'Negeri Sembilan', 'Seremban', 2.727716, 101.926327, 0, NULL, NULL),
    (v_p_tanjungtuan, v_port_dickson, 'poi', 'Tanjung Tuan Lighthouse', 'tanjung-tuan', 'Negeri Sembilan', 'Port Dickson', 2.407278, 101.852154, 0, NULL, NULL),
    (v_p_armymuseum, v_port_dickson, 'poi', 'Port Dickson Army Museum', 'pd-army-museum', 'Negeri Sembilan', 'Port Dickson', 2.496538, 101.847241, 0, NULL, NULL),
    (v_p_0kmpd, v_port_dickson, 'poi', '0km Port Dickson', '0km-port-dickson', 'Negeri Sembilan', 'Port Dickson', 2.523768, 101.796243, 0, NULL, NULL),
    (v_p_kotalukut, v_port_dickson, 'poi', 'Muzium Kota Lukut', 'muzium-kota-lukut', 'Negeri Sembilan', 'Port Dickson', 2.568151, 101.822789, 0, NULL, NULL),
    (v_p_istanalama, v_sri_menanti, 'poi', 'Muzium DiRaja Istana Lama Seri Menanti', 'istana-lama-seri-menanti', 'Negeri Sembilan', 'Kuala Pilah', 2.697957, 102.157135, 5.00, v_v_istanalama, NULL),
    (v_p_balairong, v_sri_menanti, 'poi', 'Balairong Seri Istana Seri Menanti', 'balairong-seri', 'Negeri Sembilan', 'Kuala Pilah', 2.701964, 102.157918, 0, NULL, NULL),
    (v_p_makamdiraja, v_sri_menanti, 'poi', 'Makam Diraja Seri Menanti', 'makam-diraja-seri-menanti', 'Negeri Sembilan', 'Kuala Pilah', 2.696405, 102.161137, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_yeekee, v_v_yeekee, 'Yee Kee Beef Noodles', 'yee-kee-beef-noodles', NULL, 'Seremban', 'Negeri Sembilan', 2.725030, 101.938258),
    (o_hoongkee, v_v_hoongkee, 'Restoran Hoong Kee', 'restoran-hoong-kee', NULL, 'Seremban', 'Negeri Sembilan', 2.728296, 101.925709),
    (o_lingams, v_v_lingams, 'Lingam''s Curry House', 'lingams-curry-house', NULL, 'Seremban', 'Negeri Sembilan', 2.726549, 101.940250),

    (o_keemei, v_v_keemei, 'Kee Mei Siew Pow', 'kee-mei-siew-pow', NULL, 'Seremban', 'Negeri Sembilan', 2.733014, 101.937793),

    (o_palm, v_v_palm, 'Palm Seremban Hotel', 'palm-seremban-hotel', NULL, 'Seremban', 'Negeri Sembilan', 2.719690, 101.923247),
    (o_thistle, v_v_thistle, 'Thistle Port Dickson', 'thistle-port-dickson', NULL, 'Port Dickson', 'Negeri Sembilan', 2.430545, 101.859024),
    (o_lexis, v_v_lexis, 'Lexis Hibiscus Port Dickson', 'lexis-hibiscus-port-dickson', NULL, 'Port Dickson', 'Negeri Sembilan', 2.418266, 101.873973),

    (o_bagus, v_v_bagus, 'Bagus Holiday', 'bagus-holiday', NULL, 'Seremban', 'Negeri Sembilan', 2.726149, 101.930605),
    (o_ns_travel, v_v_ns_travel, 'Seremban Travel & Tours', 'seremban-travel-tours', NULL, 'Seremban', 'Negeri Sembilan', 2.723811, 101.938141),

    (o_istanalama, v_v_istanalama, 'Muzium DiRaja Istana Lama Seri Menanti', 'muzium-diraja-istana-lama-seri-menanti', NULL, 'Kuala Pilah', 'Negeri Sembilan', 2.697957, 102.157135)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_yeekee_beefnoodle, v_v_yeekee, o_yeekee, c_food, 'Beef Noodles', 'yeekee-beef-noodles', 'Signature Seremban-style beef noodles.', 'food', false, 10.00),
    (p_yeekee_beefball, v_v_yeekee, o_yeekee, c_food, 'Beef Ball Soup', 'yeekee-beef-ball-soup', 'Handmade beef balls in clear broth.', 'food', false, 9.00),
    (p_hoongkee_beefnoodle, v_v_hoongkee, o_hoongkee, c_food, 'Beef Noodles', 'hoongkee-beef-noodles', 'Classic dry beef noodles with chilli.', 'food', false, 10.00),
    (p_hoongkee_meehoon, v_v_hoongkee, o_hoongkee, c_food, 'Beef Meehoon Soup', 'hoongkee-beef-meehoon-soup', 'Rice vermicelli in beef broth.', 'food', false, 9.50),
    (p_lingams_fishhead, v_v_lingams, o_lingams, c_food, 'Fish Head Curry', 'lingams-fish-head-curry', 'South Indian style fish head curry.', 'food', false, 25.00),
    (p_lingams_briyani, v_v_lingams, o_lingams, c_food, 'Mutton Briyani', 'lingams-mutton-briyani', 'Spiced briyani rice with mutton.', 'food', false, 16.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_keemei_siewpau, v_v_keemei, o_keemei, c_retail, 'Siew Pau Box', 'keemei-siew-pau-box', 'Box of traditional Seremban siew pau pastries.', 'product', false, 18.00)
  ON CONFLICT (id) DO NOTHING;

  -- Guide services — outlet_id NULL, place-bound only. Real vendors (2
  -- licensed Seremban travel agencies), plausible itinerary names — see plan D8.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_tanjungtuan_bagus, v_v_bagus, NULL, c_activity, 'Tanjung Tuan Eco Hike', 'tanjungtuan-eco-hike-bagus', 'Guided eco-hike through Tanjung Tuan forest reserve.', 'experience', true, 50.00),
    (p_tanjungtuan_nstravel, v_v_ns_travel, NULL, c_activity, 'Tanjung Tuan Nature Trail', 'tanjungtuan-nature-trail-nstravel', 'Small-group nature trail walk to the lighthouse.', 'experience', true, 45.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_istanalama_ticket, v_v_istanalama, o_istanalama, c_activity, 'Entry Ticket', 'istanalama-entry-ticket', 'Admission to the Sri Menanti royal museum.', 'experience', false, 5.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_palm_standard, v_v_palm, o_palm, c_accommodation, 'Standard Room', 'palm-standard-room', 'Standard room at Palm Seremban Hotel.', 'service', true, 100.00),
    (p_palm_deluxe, v_v_palm, o_palm, c_accommodation, 'Deluxe Room', 'palm-deluxe-room', 'Deluxe room at Palm Seremban Hotel.', 'service', true, 150.00),
    (p_thistle_standard, v_v_thistle, o_thistle, c_accommodation, 'Standard Room', 'thistle-standard-room', 'Standard room at Thistle Port Dickson.', 'service', true, 190.00),
    (p_thistle_seaview, v_v_thistle, o_thistle, c_accommodation, 'Sea View Room', 'thistle-seaview-room', 'Sea-view room at Thistle Port Dickson.', 'service', true, 260.00),
    (p_lexis_villa, v_v_lexis, o_lexis, c_accommodation, 'Hibiscus Villa', 'lexis-hibiscus-villa', 'Water villa at Lexis Hibiscus Port Dickson.', 'service', true, 320.00),
    (p_lexis_pool, v_v_lexis, o_lexis, c_accommodation, 'Private Pool Villa', 'lexis-private-pool-villa', 'Villa with private pool at Lexis Hibiscus Port Dickson.', 'service', true, 480.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('negeri-sembilan:variant:palm-standard')::uuid, p_palm_standard, 'Room Only', 0, true),
    (md5('negeri-sembilan:variant:palm-deluxe')::uuid, p_palm_deluxe, 'Room Only', 0, true),
    (md5('negeri-sembilan:variant:thistle-standard')::uuid, p_thistle_standard, 'Room Only', 0, true),
    (md5('negeri-sembilan:variant:thistle-seaview')::uuid, p_thistle_seaview, 'Room Only', 0, true),
    (md5('negeri-sembilan:variant:lexis-villa')::uuid, p_lexis_villa, 'Room Only', 0, true),
    (md5('negeri-sembilan:variant:lexis-pool')::uuid, p_lexis_pool, 'Room Only', 0, true),
    (md5('negeri-sembilan:variant:istanalama-ticket')::uuid, p_istanalama_ticket, 'Standard', 0, true),
    (md5('negeri-sembilan:variant:keemei-siewpau')::uuid, p_keemei_siewpau, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_keemei_siewpau)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_tanjungtuan_bagus, v_p_tanjungtuan, 'guide_service'),
    (p_tanjungtuan_nstravel, v_p_tanjungtuan, 'guide_service'),
    (p_istanalama_ticket, v_p_istanalama, 'admission'),
    (p_keemei_siewpau, v_p_pasarbesar, 'addon')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- Historical replay — fabricated demo data attached to real business
  -- names. Excludes the 2 guide products (outlet_id IS NULL). 2 orders per
  -- food/attraction product, 1 per accommodation/retail product.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-NS-SEED') THEN

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
          (p_yeekee_beefnoodle, v_v_yeekee, o_yeekee, 'Beef Noodles', 10.00::numeric, false, 2),
          (p_yeekee_beefball, v_v_yeekee, o_yeekee, 'Beef Ball Soup', 9.00::numeric, false, 2),
          (p_hoongkee_beefnoodle, v_v_hoongkee, o_hoongkee, 'Beef Noodles', 10.00::numeric, false, 2),
          (p_hoongkee_meehoon, v_v_hoongkee, o_hoongkee, 'Beef Meehoon Soup', 9.50::numeric, false, 2),
          (p_lingams_fishhead, v_v_lingams, o_lingams, 'Fish Head Curry', 25.00::numeric, false, 2),
          (p_lingams_briyani, v_v_lingams, o_lingams, 'Mutton Briyani', 16.00::numeric, false, 2),

          (p_keemei_siewpau, v_v_keemei, o_keemei, 'Siew Pau Box', 18.00::numeric, false, 1),

          (p_istanalama_ticket, v_v_istanalama, o_istanalama, 'Entry Ticket', 5.00::numeric, false, 2),

          (p_palm_standard, v_v_palm, o_palm, 'Standard Room', 100.00::numeric, true, 1),
          (p_palm_deluxe, v_v_palm, o_palm, 'Deluxe Room', 150.00::numeric, true, 1),
          (p_thistle_standard, v_v_thistle, o_thistle, 'Standard Room', 190.00::numeric, true, 1),
          (p_thistle_seaview, v_v_thistle, o_thistle, 'Sea View Room', 260.00::numeric, true, 1),
          (p_lexis_villa, v_v_lexis, o_lexis, 'Hibiscus Villa', 320.00::numeric, true, 1),
          (p_lexis_pool, v_v_lexis, o_lexis, 'Private Pool Villa', 480.00::numeric, true, 1)
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
            UPDATE orders SET display_id = 'ORD-NS-SEED' WHERE id = v_order_id;
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
    SELECT vendor_id FROM outlets WHERE state = 'Negeri Sembilan');
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Negeri Sembilan vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Negeri Sembilan';
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Negeri Sembilan outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE v.id IN (SELECT vendor_id FROM outlets WHERE state = 'Negeri Sembilan');
  IF n <> 16 THEN RAISE EXCEPTION 'expected 16 Negeri Sembilan products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Negeri Sembilan'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Negeri Sembilan products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Negeri Sembilan';
  IF n <> 14 THEN RAISE EXCEPTION 'expected 14 Negeri Sembilan places (1 state + 3 regions + 10 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Negeri Sembilan';
  IF n <> 4 THEN RAISE EXCEPTION 'expected 4 Negeri Sembilan product_places links, found %', n; END IF;
END $$;

COMMIT;
