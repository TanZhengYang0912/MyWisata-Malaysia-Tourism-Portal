-- Perak place model — seed data.
-- See docs/plans/2026-08-14-2000-perak-real-business-seed.md
--
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real Perak
-- (Ipoh, Taiping, Batu Gajah) businesses sourced from OpenStreetMap
-- — © OpenStreetMap contributors, ODbL v1.0.
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, reviews, ratings, revenue
-- and wallet balances in the replay block are randomly generated demo
-- content for an academic project. They do not describe the real
-- businesses named here.
--
-- NO EXCEPTIONS: every vendor, outlet, name and coordinate below is real.
-- Sunway Lost World of Tambun is both the POI and its own vendor — a real
-- single-operator theme park with no separate on-site retailer identified
-- in OSM (see plan D3).
--
-- category_id resolved once via c_food/c_activity/c_accommodation/c_retail.

BEGIN;

DO $$
DECLARE
  v_perak uuid := md5('perak:place:perak')::uuid;
  v_ipoh uuid := md5('perak:place:ipoh')::uuid;
  v_taiping uuid := md5('perak:place:taiping')::uuid;
  v_batu_gajah uuid := md5('perak:place:batu-gajah')::uuid;

  v_p_railway uuid := md5('perak:place:ipoh-railway-station')::uuid;
  v_p_clocktower uuid := md5('perak:place:birch-memorial-clock-tower')::uuid;
  v_p_sampoh uuid := md5('perak:place:sam-poh-tong-temple')::uuid;
  v_p_kongheng uuid := md5('perak:place:kong-heng-square')::uuid;
  v_p_lostworld uuid := md5('perak:place:lost-world-of-tambun')::uuid;
  v_p_taiping_lake uuid := md5('perak:place:taiping-lake-garden')::uuid;
  v_p_taiping_clock uuid := md5('perak:place:taiping-clock-tower')::uuid;
  v_p_taiping_zoo uuid := md5('perak:place:taiping-zoo')::uuid;
  v_p_kellies uuid := md5('perak:place:kellies-castle')::uuid;
  v_p_gopeng_museum uuid := md5('perak:place:gopeng-museum')::uuid;

  v_v_sinyoonloong uuid := md5('perak:vendor:food-sin-yoon-loong')::uuid;
  v_v_namheong uuid := md5('perak:vendor:food-nam-heong-old-town-white-coffee')::uuid;
  v_v_louwong uuid := md5('perak:vendor:food-restoran-tauge-ayam-lou-wong')::uuid;

  v_v_lamfong uuid := md5('perak:vendor:retail-lam-fong-biscuit-house')::uuid;

  v_v_majestic uuid := md5('perak:vendor:accom-the-majestic-station-hotel')::uuid;
  v_v_excelsior uuid := md5('perak:vendor:accom-excelsior-hotel')::uuid;
  v_v_furama uuid := md5('perak:vendor:accom-furama-hotel')::uuid;

  v_v_yewngee uuid := md5('perak:vendor:guide-agensi-ekspres-yew-ngee')::uuid;
  v_v_yoyo uuid := md5('perak:vendor:guide-yoyo-holiday')::uuid;

  v_v_lostworld uuid := md5('perak:vendor:attraction-sunway-lost-world-of-tambun')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_sinyoonloong uuid := md5('perak:outlet:sin-yoon-loong')::uuid;
  o_namheong uuid := md5('perak:outlet:nam-heong-old-town-white-coffee')::uuid;
  o_louwong uuid := md5('perak:outlet:restoran-tauge-ayam-lou-wong')::uuid;
  o_lamfong uuid := md5('perak:outlet:lam-fong-biscuit-house')::uuid;
  o_majestic uuid := md5('perak:outlet:the-majestic-station-hotel')::uuid;
  o_excelsior uuid := md5('perak:outlet:excelsior-hotel')::uuid;
  o_furama uuid := md5('perak:outlet:furama-hotel')::uuid;
  o_yewngee uuid := md5('perak:outlet:agensi-ekspres-yew-ngee')::uuid;
  o_yoyo uuid := md5('perak:outlet:yoyo-holiday')::uuid;
  o_lostworld uuid := md5('perak:outlet:sunway-lost-world-of-tambun')::uuid;

  p_sinyoonloong_coffee uuid := md5('perak:product:sinyoonloong-white-coffee')::uuid;
  p_sinyoonloong_toast uuid := md5('perak:product:sinyoonloong-kaya-butter-toast')::uuid;
  p_namheong_coffee uuid := md5('perak:product:namheong-white-coffee')::uuid;
  p_namheong_eggs uuid := md5('perak:product:namheong-half-boiled-eggs-set')::uuid;
  p_louwong_chicken uuid := md5('perak:product:louwong-beansprout-chicken-rice')::uuid;
  p_louwong_horfun uuid := md5('perak:product:louwong-hor-fun')::uuid;

  p_lamfong_biscuit uuid := md5('perak:product:lamfong-ipoh-heritage-biscuit-box')::uuid;

  p_kellies_yewngee uuid := md5('perak:product:kellies-castle-heritage-tour-yewngee')::uuid;
  p_kellies_yoyo uuid := md5('perak:product:kellies-castle-history-walk-yoyo')::uuid;

  p_lostworld_ticket uuid := md5('perak:product:lostworld-entry-ticket')::uuid;

  p_majestic_standard uuid := md5('perak:product:majestic-standard-room')::uuid;
  p_majestic_deluxe uuid := md5('perak:product:majestic-deluxe-room')::uuid;
  p_excelsior_standard uuid := md5('perak:product:excelsior-standard-room')::uuid;
  p_excelsior_deluxe uuid := md5('perak:product:excelsior-deluxe-room')::uuid;
  p_furama_standard uuid := md5('perak:product:furama-standard-room')::uuid;
  p_furama_deluxe uuid := md5('perak:product:furama-deluxe-room')::uuid;

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
    (v_v_sinyoonloong, v_owner_ali, 'Sin Yoon Loong', 'sin-yoon-loong',
     'Original Ipoh white coffee kopitiam, est. 1930s.', 'food', 'approved', now()),
    (v_v_namheong, v_owner_raj, 'Nam Heong Old Town White Coffee', 'nam-heong-old-town-white-coffee',
     'Heritage white coffee kopitiam in Ipoh old town.', 'food', 'approved', now()),
    (v_v_louwong, v_owner_siti, 'Restoran Tauge Ayam Lou Wong', 'restoran-tauge-ayam-lou-wong',
     'Famous beansprout chicken rice restaurant in Ipoh.', 'food', 'approved', now()),

    (v_v_lamfong, v_owner_ali, 'Lam Fong Biscuit House', 'lam-fong-biscuit-house',
     'Heritage biscuit and bakery shop in Ipoh old town.', 'retail', 'approved', now()),

    (v_v_majestic, v_owner_raj, 'The Majestic Station Hotel', 'the-majestic-station-hotel',
     'Heritage hotel attached to Ipoh Railway Station.', 'accommodation', 'approved', now()),
    (v_v_excelsior, v_owner_siti, 'Excelsior Hotel', 'excelsior-hotel',
     'Hotel in Ipoh city centre.', 'accommodation', 'approved', now()),
    (v_v_furama, v_owner_ali, 'Furama Hotel', 'furama-hotel',
     'Hotel in Taiping.', 'accommodation', 'approved', now()),

    (v_v_yewngee, v_owner_raj, 'Agensi Ekspres Yew Ngee', 'agensi-ekspres-yew-ngee',
     'Licensed travel agency in Ipoh.', 'activity', 'approved', now()),
    (v_v_yoyo, v_owner_siti, 'YOYO HOLIDAY SDN BHD', 'yoyo-holiday',
     'Licensed travel agency in Ipoh.', 'activity', 'approved', now()),

    (v_v_lostworld, v_owner_ali, 'Sunway Lost World of Tambun', 'sunway-lost-world-of-tambun',
     'Theme park and hot springs attraction in Tambun, Ipoh.', 'attraction', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_sinyoonloong, v_v_namheong, v_v_louwong, v_v_lamfong,
    v_v_majestic, v_v_excelsior, v_v_furama,
    v_v_yewngee, v_v_yoyo, v_v_lostworld
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_perak, NULL, 'state', 'Perak', 'perak', 'Perak', NULL, 4.5975, 101.0901, NULL, NULL, NULL),

    (v_ipoh, v_perak, 'region', 'Ipoh', 'ipoh', 'Perak', 'Ipoh', 4.5975, 101.0901, NULL, NULL, NULL),
    (v_taiping, v_perak, 'region', 'Taiping', 'taiping', 'Perak', 'Taiping', 4.8500, 100.7400, NULL, NULL, NULL),
    (v_batu_gajah, v_perak, 'region', 'Batu Gajah', 'batu-gajah', 'Perak', 'Batu Gajah', 4.4685, 101.0500, NULL, NULL, NULL),

    (v_p_railway, v_ipoh, 'poi', 'Ipoh Railway Station', 'ipoh-railway-station', 'Perak', 'Ipoh', 4.597042, 101.073566, 0, NULL, NULL),
    (v_p_clocktower, v_ipoh, 'poi', 'Birch Memorial Clock Tower', 'birch-memorial-clock-tower', 'Perak', 'Ipoh', 4.596828, 101.076192, 0, NULL, NULL),
    (v_p_sampoh, v_ipoh, 'poi', 'Sam Poh Tong Temple', 'sam-poh-tong-temple', 'Perak', 'Ipoh', 4.563738, 101.115416, 0, NULL, NULL),
    (v_p_kongheng, v_ipoh, 'poi', 'Kong Heng Square', 'kong-heng-square', 'Perak', 'Ipoh', 4.596518, 101.077530, 0, NULL, NULL),
    (v_p_lostworld, v_ipoh, 'poi', 'Lost World of Tambun', 'lost-world-of-tambun', 'Perak', 'Ipoh', 4.624949, 101.155704, 90.00, v_v_lostworld, NULL),
    (v_p_taiping_lake, v_taiping, 'poi', 'Taiping Lake Garden', 'taiping-lake-garden', 'Perak', 'Taiping', 4.853788, 100.747480, 0, NULL, NULL),
    (v_p_taiping_clock, v_taiping, 'poi', 'Taiping Clock Tower', 'taiping-clock-tower', 'Perak', 'Taiping', 4.852194, 100.741905, 0, NULL, NULL),
    (v_p_taiping_zoo, v_taiping, 'poi', 'Taiping Zoo & Night Safari', 'taiping-zoo', 'Perak', 'Taiping', 4.854693, 100.750987, 24.00, NULL, NULL),
    (v_p_kellies, v_batu_gajah, 'poi', 'Kellie''s Castle', 'kellies-castle', 'Perak', 'Batu Gajah', 4.474482, 101.087755, 10.00, NULL, NULL),
    (v_p_gopeng_museum, v_batu_gajah, 'poi', 'Gopeng Museum', 'gopeng-museum', 'Perak', 'Batu Gajah', 4.473970, 101.166815, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_sinyoonloong, v_v_sinyoonloong, 'Sin Yoon Loong', 'sin-yoon-loong', NULL, 'Ipoh', 'Perak', 4.593230, 101.076924),
    (o_namheong, v_v_namheong, 'Nam Heong Old Town White Coffee', 'nam-heong-old-town-white-coffee', NULL, 'Ipoh', 'Perak', 4.593186, 101.077124),
    (o_louwong, v_v_louwong, 'Restoran Tauge Ayam Lou Wong', 'restoran-tauge-ayam-lou-wong', NULL, 'Ipoh', 'Perak', 4.594011, 101.084225),

    (o_lamfong, v_v_lamfong, 'Lam Fong Biscuit House', 'lam-fong-biscuit-house', NULL, 'Ipoh', 'Perak', 4.593785, 101.084158),

    (o_majestic, v_v_majestic, 'The Majestic Station Hotel', 'the-majestic-station-hotel', NULL, 'Ipoh', 'Perak', 4.597702, 101.073222),
    (o_excelsior, v_v_excelsior, 'Excelsior Hotel', 'excelsior-hotel', NULL, 'Ipoh', 'Perak', 4.597282, 101.086358),
    (o_furama, v_v_furama, 'Furama Hotel', 'furama-hotel', NULL, 'Taiping', 'Perak', 4.850252, 100.745491),

    (o_yewngee, v_v_yewngee, 'Agensi Ekspres Yew Ngee', 'agensi-ekspres-yew-ngee', NULL, 'Ipoh', 'Perak', 4.592498, 101.084759),
    (o_yoyo, v_v_yoyo, 'YOYO HOLIDAY SDN BHD', 'yoyo-holiday', NULL, 'Ipoh', 'Perak', 4.632093, 101.126961),

    (o_lostworld, v_v_lostworld, 'Sunway Lost World of Tambun', 'sunway-lost-world-of-tambun', NULL, 'Ipoh', 'Perak', 4.624949, 101.155704)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_sinyoonloong_coffee, v_v_sinyoonloong, o_sinyoonloong, c_food, 'White Coffee', 'sinyoonloong-white-coffee', 'Traditional Ipoh white coffee.', 'food', false, 5.50),
    (p_sinyoonloong_toast, v_v_sinyoonloong, o_sinyoonloong, c_food, 'Kaya Butter Toast', 'sinyoonloong-kaya-butter-toast', 'Charcoal-toasted bread with kaya and butter.', 'food', false, 6.50),
    (p_namheong_coffee, v_v_namheong, o_namheong, c_food, 'White Coffee', 'namheong-white-coffee', 'Heritage-recipe white coffee.', 'food', false, 5.50),
    (p_namheong_eggs, v_v_namheong, o_namheong, c_food, 'Half-Boiled Eggs Set', 'namheong-half-boiled-eggs-set', 'Half-boiled eggs with toast and coffee.', 'food', false, 7.00),
    (p_louwong_chicken, v_v_louwong, o_louwong, c_food, 'Beansprout Chicken Rice', 'louwong-beansprout-chicken-rice', 'Steamed chicken with crunchy beansprouts and rice.', 'food', false, 12.00),
    (p_louwong_horfun, v_v_louwong, o_louwong, c_food, 'Hor Fun', 'louwong-hor-fun', 'Flat rice noodles in silky chicken broth.', 'food', false, 10.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_lamfong_biscuit, v_v_lamfong, o_lamfong, c_retail, 'Ipoh Heritage Biscuit Box', 'lamfong-ipoh-heritage-biscuit-box', 'Assorted traditional biscuits, boxed.', 'product', false, 25.00)
  ON CONFLICT (id) DO NOTHING;

  -- Guide services — outlet_id NULL, place-bound only. Real vendors (2
  -- licensed Ipoh travel agencies), plausible itinerary names — see plan D8.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_kellies_yewngee, v_v_yewngee, NULL, c_activity, 'Kellie''s Castle Heritage Tour', 'kellies-castle-heritage-tour-yewngee', 'Guided heritage tour of Kellie''s Castle.', 'experience', true, 45.00),
    (p_kellies_yoyo, v_v_yoyo, NULL, c_activity, 'Kellie''s Castle History Walk', 'kellies-castle-history-walk-yoyo', 'Small-group history walk through Kellie''s Castle.', 'experience', true, 40.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_lostworld_ticket, v_v_lostworld, o_lostworld, c_activity, 'Entry Ticket', 'lostworld-entry-ticket', 'Full-day admission to Lost World of Tambun.', 'experience', false, 90.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_majestic_standard, v_v_majestic, o_majestic, c_accommodation, 'Standard Room', 'majestic-standard-room', 'Standard room at The Majestic Station Hotel.', 'service', true, 120.00),
    (p_majestic_deluxe, v_v_majestic, o_majestic, c_accommodation, 'Deluxe Room', 'majestic-deluxe-room', 'Deluxe room at The Majestic Station Hotel.', 'service', true, 180.00),
    (p_excelsior_standard, v_v_excelsior, o_excelsior, c_accommodation, 'Standard Room', 'excelsior-standard-room', 'Standard room at Excelsior Hotel.', 'service', true, 95.00),
    (p_excelsior_deluxe, v_v_excelsior, o_excelsior, c_accommodation, 'Deluxe Room', 'excelsior-deluxe-room', 'Deluxe room at Excelsior Hotel.', 'service', true, 140.00),
    (p_furama_standard, v_v_furama, o_furama, c_accommodation, 'Standard Room', 'furama-standard-room', 'Standard room at Furama Hotel.', 'service', true, 110.00),
    (p_furama_deluxe, v_v_furama, o_furama, c_accommodation, 'Deluxe Room', 'furama-deluxe-room', 'Deluxe room at Furama Hotel.', 'service', true, 160.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('perak:variant:majestic-standard')::uuid, p_majestic_standard, 'Room Only', 0, true),
    (md5('perak:variant:majestic-deluxe')::uuid, p_majestic_deluxe, 'Room Only', 0, true),
    (md5('perak:variant:excelsior-standard')::uuid, p_excelsior_standard, 'Room Only', 0, true),
    (md5('perak:variant:excelsior-deluxe')::uuid, p_excelsior_deluxe, 'Room Only', 0, true),
    (md5('perak:variant:furama-standard')::uuid, p_furama_standard, 'Room Only', 0, true),
    (md5('perak:variant:furama-deluxe')::uuid, p_furama_deluxe, 'Room Only', 0, true),
    (md5('perak:variant:lostworld-ticket')::uuid, p_lostworld_ticket, 'Standard', 0, true),
    (md5('perak:variant:lamfong-biscuit')::uuid, p_lamfong_biscuit, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_lamfong_biscuit)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_kellies_yewngee, v_p_kellies, 'guide_service'),
    (p_kellies_yoyo, v_p_kellies, 'guide_service'),
    (p_lostworld_ticket, v_p_lostworld, 'admission'),
    (p_lamfong_biscuit, v_p_kongheng, 'addon')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- Historical replay — fabricated demo data attached to real business
  -- names. Excludes the 2 guide products (outlet_id IS NULL). 2 orders per
  -- food/attraction product, 1 per accommodation/retail product.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-PK-SEED') THEN

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
          (p_sinyoonloong_coffee, v_v_sinyoonloong, o_sinyoonloong, 'White Coffee', 5.50::numeric, false, 2),
          (p_sinyoonloong_toast, v_v_sinyoonloong, o_sinyoonloong, 'Kaya Butter Toast', 6.50::numeric, false, 2),
          (p_namheong_coffee, v_v_namheong, o_namheong, 'White Coffee', 5.50::numeric, false, 2),
          (p_namheong_eggs, v_v_namheong, o_namheong, 'Half-Boiled Eggs Set', 7.00::numeric, false, 2),
          (p_louwong_chicken, v_v_louwong, o_louwong, 'Beansprout Chicken Rice', 12.00::numeric, false, 2),
          (p_louwong_horfun, v_v_louwong, o_louwong, 'Hor Fun', 10.00::numeric, false, 2),

          (p_lamfong_biscuit, v_v_lamfong, o_lamfong, 'Ipoh Heritage Biscuit Box', 25.00::numeric, false, 1),

          (p_lostworld_ticket, v_v_lostworld, o_lostworld, 'Entry Ticket', 90.00::numeric, false, 2),

          (p_majestic_standard, v_v_majestic, o_majestic, 'Standard Room', 120.00::numeric, true, 1),
          (p_majestic_deluxe, v_v_majestic, o_majestic, 'Deluxe Room', 180.00::numeric, true, 1),
          (p_excelsior_standard, v_v_excelsior, o_excelsior, 'Standard Room', 95.00::numeric, true, 1),
          (p_excelsior_deluxe, v_v_excelsior, o_excelsior, 'Deluxe Room', 140.00::numeric, true, 1),
          (p_furama_standard, v_v_furama, o_furama, 'Standard Room', 110.00::numeric, true, 1),
          (p_furama_deluxe, v_v_furama, o_furama, 'Deluxe Room', 160.00::numeric, true, 1)
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
            UPDATE orders SET display_id = 'ORD-PK-SEED' WHERE id = v_order_id;
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
    SELECT vendor_id FROM outlets WHERE state = 'Perak');
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Perak vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Perak';
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Perak outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE v.id IN (SELECT vendor_id FROM outlets WHERE state = 'Perak');
  IF n <> 16 THEN RAISE EXCEPTION 'expected 16 Perak products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Perak'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Perak products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Perak';
  IF n <> 14 THEN RAISE EXCEPTION 'expected 14 Perak places (1 state + 3 regions + 10 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Perak';
  IF n <> 4 THEN RAISE EXCEPTION 'expected 4 Perak product_places links, found %', n; END IF;
END $$;

COMMIT;
