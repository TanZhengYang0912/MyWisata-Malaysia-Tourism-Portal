-- Sarawak place model — seed data.
-- See docs/plans/2026-08-14-1730-sarawak-real-business-seed.md
--
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real Sarawak
-- (Kuching, Semenggoh, Santubong) businesses sourced from OpenStreetMap —
-- © OpenStreetMap contributors, ODbL v1.0.
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, reviews, ratings, revenue
-- and wallet balances in the replay block are randomly generated demo
-- content for an academic project. They do not describe the real
-- businesses named here.
--
-- NO EXCEPTIONS: every vendor, outlet, name and coordinate below is real.
-- Cat Museum and Sarawak Cultural Village were dropped from scope — zero
-- OSM matches under several search terms (see plan D3). Upside Down House
-- Kuching's operator company was not resolvable via OSM, so the
-- attraction itself (a real, OSM-tagged tourism=attraction node) is used
-- directly as the vendor (see plan D4).
--
-- category_id resolved once via c_food/c_activity/c_accommodation/c_retail.

BEGIN;

DO $$
DECLARE
  v_sarawak uuid := md5('sarawak:place:sarawak')::uuid;
  v_kuching uuid := md5('sarawak:place:kuching')::uuid;
  v_semenggoh uuid := md5('sarawak:place:semenggoh')::uuid;
  v_santubong uuid := md5('sarawak:place:santubong')::uuid;

  v_p_waterfront_bazaar uuid := md5('sarawak:place:kuching-waterfront-bazaar')::uuid;
  v_p_fort_margherita uuid := md5('sarawak:place:fort-margherita')::uuid;
  v_p_kuching_sign uuid := md5('sarawak:place:kuching-sign')::uuid;
  v_p_satok_market uuid := md5('sarawak:place:satok-market')::uuid;
  v_p_bishops_house uuid := md5('sarawak:place:bishops-house')::uuid;
  v_p_lightshow uuid := md5('sarawak:place:waterfront-lightshow')::uuid;
  v_p_upside_down uuid := md5('sarawak:place:upside-down-house')::uuid;
  v_p_semenggoh uuid := md5('sarawak:place:semenggoh-wildlife-centre')::uuid;
  v_p_santubong_park uuid := md5('sarawak:place:santubong-national-park')::uuid;
  v_p_gunung_santubong uuid := md5('sarawak:place:gunung-santubong')::uuid;

  v_v_james_brooke uuid := md5('sarawak:vendor:food-james-brooke-cafe')::uuid;
  v_v_zhun_san_yen uuid := md5('sarawak:vendor:food-zhun-san-yen-vegetarian')::uuid;
  v_v_hong_hin uuid := md5('sarawak:vendor:food-hong-hin')::uuid;

  v_v_tanoti uuid := md5('sarawak:vendor:retail-tanoti-weavers-workshop')::uuid;

  v_v_pullman uuid := md5('sarawak:vendor:accom-pullman-kuching')::uuid;
  v_v_limetree uuid := md5('sarawak:vendor:accom-the-limetree-hotel')::uuid;
  v_v_hilton uuid := md5('sarawak:vendor:accom-hilton-kuching')::uuid;

  v_v_good_times uuid := md5('sarawak:vendor:guide-good-times-travel')::uuid;
  v_v_kapit_adventure uuid := md5('sarawak:vendor:guide-kapit-adventure-tours')::uuid;

  v_v_upside_down uuid := md5('sarawak:vendor:op-upside-down-house-kuching')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_james_brooke uuid := md5('sarawak:outlet:james-brooke-cafe')::uuid;
  o_zhun_san_yen uuid := md5('sarawak:outlet:zhun-san-yen-vegetarian')::uuid;
  o_hong_hin uuid := md5('sarawak:outlet:hong-hin')::uuid;
  o_tanoti uuid := md5('sarawak:outlet:tanoti-weavers-workshop')::uuid;
  o_pullman uuid := md5('sarawak:outlet:pullman-kuching')::uuid;
  o_limetree uuid := md5('sarawak:outlet:the-limetree-hotel')::uuid;
  o_hilton uuid := md5('sarawak:outlet:hilton-kuching')::uuid;
  o_good_times uuid := md5('sarawak:outlet:good-times-travel')::uuid;
  o_kapit_adventure uuid := md5('sarawak:outlet:kapit-adventure-tours')::uuid;
  o_upside_down uuid := md5('sarawak:outlet:upside-down-house-kuching')::uuid;

  p_jamesbrooke_laksa uuid := md5('sarawak:product:jamesbrooke-sarawak-laksa')::uuid;
  p_jamesbrooke_coffee uuid := md5('sarawak:product:jamesbrooke-white-coffee')::uuid;
  p_zhunsan_noodle uuid := md5('sarawak:product:zhunsan-vegetarian-noodle')::uuid;
  p_zhunsan_rice uuid := md5('sarawak:product:zhunsan-vegetarian-rice-set')::uuid;
  p_honghin_kolomee uuid := md5('sarawak:product:honghin-kolo-mee')::uuid;
  p_honghin_wanton uuid := md5('sarawak:product:honghin-wanton-noodle')::uuid;

  p_tanoti_sampler uuid := md5('sarawak:product:tanoti-songket-weave-sampler')::uuid;

  p_semenggoh_feeding uuid := md5('sarawak:product:semenggoh-orangutan-feeding-tour')::uuid;
  p_semenggoh_rainforest uuid := md5('sarawak:product:semenggoh-rainforest-half-day-tour')::uuid;

  p_upsidedown_ticket uuid := md5('sarawak:product:upsidedown-entry-ticket')::uuid;

  p_pullman_deluxe uuid := md5('sarawak:product:pullman-deluxe-room')::uuid;
  p_pullman_suite uuid := md5('sarawak:product:pullman-suite')::uuid;
  p_limetree_standard uuid := md5('sarawak:product:limetree-standard-room')::uuid;
  p_limetree_deluxe uuid := md5('sarawak:product:limetree-deluxe-room')::uuid;
  p_hilton_room uuid := md5('sarawak:product:hilton-kuching-room')::uuid;
  p_hilton_suite uuid := md5('sarawak:product:hilton-kuching-suite')::uuid;

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
    (v_v_james_brooke, v_owner_ali, 'James Brooke Cafe', 'james-brooke-cafe',
     'Cafe on the Kuching waterfront.', 'food', 'approved', now()),
    (v_v_zhun_san_yen, v_owner_raj, 'Zhun San Yen Vegetarian', 'zhun-san-yen-vegetarian',
     'Vegetarian restaurant in Kuching.', 'food', 'approved', now()),
    (v_v_hong_hin, v_owner_siti, 'Hong Hin', 'hong-hin',
     'Kolo mee restaurant in Kuching.', 'food', 'approved', now()),

    (v_v_tanoti, v_owner_ali, 'Tanoti Weavers Workshop', 'tanoti-weavers-workshop',
     'Songket weaving workshop and gallery in Kuching.', 'retail', 'approved', now()),

    (v_v_pullman, v_owner_raj, 'Pullman Kuching', 'pullman-kuching',
     'Hotel in Kuching.', 'accommodation', 'approved', now()),
    (v_v_limetree, v_owner_siti, 'The LimeTree Hotel', 'the-limetree-hotel',
     'Hotel in Kuching.', 'accommodation', 'approved', now()),
    (v_v_hilton, v_owner_ali, 'Hilton Kuching', 'hilton-kuching',
     'Hotel in Kuching.', 'accommodation', 'approved', now()),

    (v_v_good_times, v_owner_raj, 'Good Times Travel', 'good-times-travel',
     'Licensed travel agency in Kuching.', 'activity', 'approved', now()),
    (v_v_kapit_adventure, v_owner_siti, 'Kapit Adventure Tours', 'kapit-adventure-tours',
     'Licensed travel agency in Kuching.', 'activity', 'approved', now()),

    (v_v_upside_down, v_owner_ali, 'Upside Down House Kuching', 'upside-down-house-kuching',
     'Novelty attraction house in Kuching.', 'attraction', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_james_brooke, v_v_zhun_san_yen, v_v_hong_hin, v_v_tanoti,
    v_v_pullman, v_v_limetree, v_v_hilton,
    v_v_good_times, v_v_kapit_adventure, v_v_upside_down
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_sarawak, NULL, 'state', 'Sarawak', 'sarawak', 'Sarawak', NULL, 1.5597, 110.3459, NULL, NULL, NULL),

    (v_kuching, v_sarawak, 'region', 'Kuching', 'kuching', 'Sarawak', 'Kuching', 1.5597, 110.3459, NULL, NULL, NULL),
    (v_semenggoh, v_sarawak, 'region', 'Semenggoh', 'semenggoh', 'Sarawak', 'Semenggoh', 1.3998, 110.3244, NULL, NULL, NULL),
    (v_santubong, v_sarawak, 'region', 'Santubong', 'santubong', 'Sarawak', 'Santubong', 1.7436, 110.3177, NULL, NULL, NULL),

    (v_p_waterfront_bazaar, v_kuching, 'poi', 'Kuching Waterfront Bazaar', 'kuching-waterfront-bazaar', 'Sarawak', 'Kuching', 1.559752, 110.345901, 0, NULL, NULL),
    (v_p_fort_margherita, v_kuching, 'poi', 'Fort Margherita', 'fort-margherita', 'Sarawak', 'Kuching', 1.560474, 110.349488, 0, NULL, NULL),
    (v_p_kuching_sign, v_kuching, 'poi', 'Kuching Sign', 'kuching-sign', 'Sarawak', 'Kuching', 1.558333, 110.351154, 0, NULL, NULL),
    (v_p_satok_market, v_kuching, 'poi', 'Satok Market', 'satok-market', 'Sarawak', 'Kuching', 1.554835, 110.322215, 0, NULL, NULL),
    (v_p_bishops_house, v_kuching, 'poi', 'Bishop''s House', 'bishops-house', 'Sarawak', 'Kuching', 1.556758, 110.346588, 0, NULL, NULL),
    (v_p_lightshow, v_kuching, 'poi', 'Water and Lightshow', 'waterfront-lightshow', 'Sarawak', 'Kuching', 1.560971, 110.347028, 0, NULL, NULL),
    (v_p_upside_down, v_kuching, 'poi', 'Upside Down House Kuching', 'upside-down-house', 'Sarawak', 'Kuching', 1.557676, 110.350903, 25.00, v_v_upside_down, NULL),
    (v_p_semenggoh, v_semenggoh, 'poi', 'Semenggoh Wildlife Centre', 'semenggoh-wildlife-centre', 'Sarawak', 'Semenggoh', 1.399800, 110.324428, 0, NULL, NULL),
    (v_p_santubong_park, v_santubong, 'poi', 'Santubong National Park', 'santubong-national-park', 'Sarawak', 'Santubong', 1.743576, 110.317715, 0, NULL, NULL),
    (v_p_gunung_santubong, v_santubong, 'poi', 'Gunung Santubong', 'gunung-santubong', 'Sarawak', 'Santubong', 1.736877, 110.332537, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_james_brooke, v_v_james_brooke, 'James Brooke Cafe', 'james-brooke-cafe', NULL, 'Kuching', 'Sarawak', 1.557603, 110.349370),
    (o_zhun_san_yen, v_v_zhun_san_yen, 'Zhun San Yen Vegetarian', 'zhun-san-yen-vegetarian', NULL, 'Kuching', 'Sarawak', 1.557710, 110.354792),
    (o_hong_hin, v_v_hong_hin, 'Hong Hin', 'hong-hin', NULL, 'Kuching', 'Sarawak', 1.557483, 110.354169),

    (o_tanoti, v_v_tanoti, 'Tanoti Weavers Workshop', 'tanoti-weavers-workshop', NULL, 'Kuching', 'Sarawak', 1.549340, 110.351135),

    (o_pullman, v_v_pullman, 'Pullman Kuching', 'pullman-kuching', NULL, 'Kuching', 'Sarawak', 1.555604, 110.350863),
    (o_limetree, v_v_limetree, 'The LimeTree Hotel', 'the-limetree-hotel', NULL, 'Kuching', 'Sarawak', 1.556181, 110.356411),
    (o_hilton, v_v_hilton, 'Hilton Kuching', 'hilton-kuching', NULL, 'Kuching', 'Sarawak', 1.557090, 110.350260),

    (o_good_times, v_v_good_times, 'Good Times Travel', 'good-times-travel', NULL, 'Kuching', 'Sarawak', 1.512193, 110.353859),
    (o_kapit_adventure, v_v_kapit_adventure, 'Kapit Adventure Tours', 'kapit-adventure-tours', NULL, 'Kuching', 'Sarawak', 1.519916, 110.336590),

    (o_upside_down, v_v_upside_down, 'Upside Down House Kuching', 'upside-down-house-kuching', NULL, 'Kuching', 'Sarawak', 1.557676, 110.350903)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_jamesbrooke_laksa, v_v_james_brooke, o_james_brooke, c_food, 'Sarawak Laksa', 'jamesbrooke-sarawak-laksa', 'Sarawak-style laksa with prawn and chicken.', 'food', false, 16.00),
    (p_jamesbrooke_coffee, v_v_james_brooke, o_james_brooke, c_food, 'White Coffee', 'jamesbrooke-white-coffee', 'Local white coffee.', 'food', false, 6.00),
    (p_zhunsan_noodle, v_v_zhun_san_yen, o_zhun_san_yen, c_food, 'Vegetarian Noodle', 'zhunsan-vegetarian-noodle', 'Stir-fried vegetarian noodle.', 'food', false, 9.00),
    (p_zhunsan_rice, v_v_zhun_san_yen, o_zhun_san_yen, c_food, 'Vegetarian Rice Set', 'zhunsan-vegetarian-rice-set', 'Rice with mixed vegetarian dishes.', 'food', false, 10.00),
    (p_honghin_kolomee, v_v_hong_hin, o_hong_hin, c_food, 'Kolo Mee', 'honghin-kolo-mee', 'Sarawak-style dry tossed noodles.', 'food', false, 8.00),
    (p_honghin_wanton, v_v_hong_hin, o_hong_hin, c_food, 'Wanton Noodle', 'honghin-wanton-noodle', 'Noodles with pork wanton dumplings.', 'food', false, 9.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_tanoti_sampler, v_v_tanoti, o_tanoti, c_retail, 'Songket Weave Sampler', 'tanoti-songket-weave-sampler', 'Handwoven songket textile sampler.', 'product', false, 68.00)
  ON CONFLICT (id) DO NOTHING;

  -- Guide services — outlet_id NULL, place-bound only. Real vendors (2
  -- licensed Kuching travel agencies), plausible itinerary names — see plan D9.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_semenggoh_feeding, v_v_good_times, NULL, c_activity, 'Semenggoh Orangutan Feeding Tour', 'semenggoh-orangutan-feeding-tour', 'Half-day trip to the Semenggoh Wildlife Centre feeding platform.', 'experience', true, 95.00),
    (p_semenggoh_rainforest, v_v_kapit_adventure, NULL, c_activity, 'Semenggoh & Rainforest Half-Day Tour', 'semenggoh-rainforest-half-day-tour', 'Guided rainforest walk and orangutan viewing at Semenggoh.', 'experience', true, 110.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_upsidedown_ticket, v_v_upside_down, o_upside_down, c_activity, 'Entry Ticket', 'upsidedown-entry-ticket', 'Entry to Upside Down House Kuching.', 'activity', true, 25.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_pullman_deluxe, v_v_pullman, o_pullman, c_accommodation, 'Deluxe Room', 'pullman-deluxe-room', 'Deluxe room at Pullman Kuching.', 'service', true, 300.00),
    (p_pullman_suite, v_v_pullman, o_pullman, c_accommodation, 'Suite', 'pullman-suite', 'Suite at Pullman Kuching.', 'service', true, 480.00),
    (p_limetree_standard, v_v_limetree, o_limetree, c_accommodation, 'Standard Room', 'limetree-standard-room', 'Standard room at The LimeTree Hotel.', 'service', true, 150.00),
    (p_limetree_deluxe, v_v_limetree, o_limetree, c_accommodation, 'Deluxe Room', 'limetree-deluxe-room', 'Deluxe room at The LimeTree Hotel.', 'service', true, 200.00),
    (p_hilton_room, v_v_hilton, o_hilton, c_accommodation, 'Deluxe Room', 'hilton-kuching-room', 'Deluxe room at Hilton Kuching.', 'service', true, 320.00),
    (p_hilton_suite, v_v_hilton, o_hilton, c_accommodation, 'Executive Suite', 'hilton-kuching-suite', 'Executive suite at Hilton Kuching.', 'service', true, 550.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('sarawak:variant:pullman-deluxe')::uuid, p_pullman_deluxe, 'Room Only', 0, true),
    (md5('sarawak:variant:pullman-suite')::uuid, p_pullman_suite, 'Room Only', 0, true),
    (md5('sarawak:variant:limetree-standard')::uuid, p_limetree_standard, 'Room Only', 0, true),
    (md5('sarawak:variant:limetree-deluxe')::uuid, p_limetree_deluxe, 'Room Only', 0, true),
    (md5('sarawak:variant:hilton-room')::uuid, p_hilton_room, 'Room Only', 0, true),
    (md5('sarawak:variant:hilton-suite')::uuid, p_hilton_suite, 'Room Only', 0, true),
    (md5('sarawak:variant:tanoti-sampler')::uuid, p_tanoti_sampler, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_tanoti_sampler)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_semenggoh_feeding, v_p_semenggoh, 'guide_service'),
    (p_semenggoh_rainforest, v_p_semenggoh, 'guide_service'),
    (p_upsidedown_ticket, v_p_upside_down, 'admission'),
    (p_tanoti_sampler, v_p_waterfront_bazaar, 'addon')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- Historical replay — fabricated demo data attached to real business
  -- names. Excludes the 2 guide products (outlet_id IS NULL). 2 orders per
  -- food/attraction product, 1 per accommodation/retail product.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-SW-SEED') THEN

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
          (p_jamesbrooke_laksa, v_v_james_brooke, o_james_brooke, 'Sarawak Laksa', 16.00::numeric, false, 2),
          (p_jamesbrooke_coffee, v_v_james_brooke, o_james_brooke, 'White Coffee', 6.00::numeric, false, 2),
          (p_zhunsan_noodle, v_v_zhun_san_yen, o_zhun_san_yen, 'Vegetarian Noodle', 9.00::numeric, false, 2),
          (p_zhunsan_rice, v_v_zhun_san_yen, o_zhun_san_yen, 'Vegetarian Rice Set', 10.00::numeric, false, 2),
          (p_honghin_kolomee, v_v_hong_hin, o_hong_hin, 'Kolo Mee', 8.00::numeric, false, 2),
          (p_honghin_wanton, v_v_hong_hin, o_hong_hin, 'Wanton Noodle', 9.00::numeric, false, 2),

          (p_upsidedown_ticket, v_v_upside_down, o_upside_down, 'Entry Ticket', 25.00::numeric, true, 2),

          (p_tanoti_sampler, v_v_tanoti, o_tanoti, 'Songket Weave Sampler', 68.00::numeric, false, 1),

          (p_pullman_deluxe, v_v_pullman, o_pullman, 'Deluxe Room', 300.00::numeric, true, 1),
          (p_pullman_suite, v_v_pullman, o_pullman, 'Suite', 480.00::numeric, true, 1),
          (p_limetree_standard, v_v_limetree, o_limetree, 'Standard Room', 150.00::numeric, true, 1),
          (p_limetree_deluxe, v_v_limetree, o_limetree, 'Deluxe Room', 200.00::numeric, true, 1),
          (p_hilton_room, v_v_hilton, o_hilton, 'Deluxe Room', 320.00::numeric, true, 1),
          (p_hilton_suite, v_v_hilton, o_hilton, 'Executive Suite', 550.00::numeric, true, 1)
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
            UPDATE orders SET display_id = 'ORD-SW-SEED' WHERE id = v_order_id;
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
    SELECT vendor_id FROM outlets WHERE state = 'Sarawak');
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Sarawak vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Sarawak';
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 Sarawak outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE v.id IN (SELECT vendor_id FROM outlets WHERE state = 'Sarawak')
       OR v.id IN (
         md5('sarawak:vendor:guide-good-times-travel')::uuid,
         md5('sarawak:vendor:guide-kapit-adventure-tours')::uuid
       );
  IF n <> 16 THEN RAISE EXCEPTION 'expected 16 Sarawak products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Sarawak'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Sarawak products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Sarawak';
  IF n <> 14 THEN RAISE EXCEPTION 'expected 14 Sarawak places (1 state + 3 regions + 10 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Sarawak';
  IF n <> 4 THEN RAISE EXCEPTION 'expected 4 Sarawak product_places links, found %', n; END IF;
END $$;

COMMIT;
