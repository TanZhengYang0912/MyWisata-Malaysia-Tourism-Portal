-- Perlis place model — seed data.
-- See docs/plans/2026-08-14-1610-perlis-real-business-seed.md
--
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real Perlis
-- (Kangar, Kaki Bukit, Padang Besar) businesses sourced from OpenStreetMap
-- — © OpenStreetMap contributors, ODbL v1.0.
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, reviews, ratings, revenue
-- and wallet balances in the replay block are randomly generated demo
-- content for an academic project. They do not describe the real
-- businesses named here.
--
-- NO EXCEPTIONS: every vendor, outlet, name and coordinate below is real.
-- Kuala Perlis was dropped from scope — zero named OSM nodes found in
-- three separate Overpass queries against its town bbox (see plan D3).
--
-- category_id resolved once via c_food/c_activity/c_accommodation/c_retail.

BEGIN;

DO $$
DECLARE
  v_perlis uuid := md5('perlis:place:perlis')::uuid;
  v_kangar uuid := md5('perlis:place:kangar')::uuid;
  v_kaki_bukit uuid := md5('perlis:place:kaki-bukit')::uuid;
  v_padang_besar uuid := md5('perlis:place:padang-besar')::uuid;

  v_p_dataran_keris uuid := md5('perlis:place:dataran-keris')::uuid;
  v_p_taman_ular uuid := md5('perlis:place:taman-ular-dan-reptilia')::uuid;
  v_p_gua_kelam uuid := md5('perlis:place:gua-kelam')::uuid;
  v_p_wang_kelian uuid := md5('perlis:place:wang-kelian-viewpoint')::uuid;
  v_p_border_bazaar uuid := md5('perlis:place:padang-besar-border-bazaar')::uuid;

  v_v_hameed uuid := md5('perlis:vendor:food-hameed-nasi-kandar')::uuid;
  v_v_mariammah uuid := md5('perlis:vendor:food-mariammah-curry-house')::uuid;

  v_v_zon uuid := md5('perlis:vendor:retail-the-zon-duty-free')::uuid;
  v_v_border_bazaar uuid := md5('perlis:vendor:retail-border-bazzar-padang-besar')::uuid;

  v_v_sri_garden uuid := md5('perlis:vendor:accom-hotel-sri-garden')::uuid;
  v_v_putra_regency uuid := md5('perlis:vendor:accom-putra-regency-hotel')::uuid;

  v_v_taman_ular_op uuid := md5('perlis:vendor:op-taman-ular-dan-reptilia')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_hameed uuid := md5('perlis:outlet:hameed-nasi-kandar')::uuid;
  o_mariammah uuid := md5('perlis:outlet:mariammah-curry-house')::uuid;
  o_zon uuid := md5('perlis:outlet:the-zon-duty-free')::uuid;
  o_border_bazaar uuid := md5('perlis:outlet:border-bazzar-padang-besar')::uuid;
  o_sri_garden uuid := md5('perlis:outlet:hotel-sri-garden')::uuid;
  o_putra_regency uuid := md5('perlis:outlet:putra-regency-hotel')::uuid;
  o_taman_ular uuid := md5('perlis:outlet:taman-ular-dan-reptilia')::uuid;

  p_hameed_set uuid := md5('perlis:product:hameed-nasi-kandar-set')::uuid;
  p_hameed_teh uuid := md5('perlis:product:hameed-teh-tarik')::uuid;
  p_mariammah_banana uuid := md5('perlis:product:mariammah-banana-leaf-rice')::uuid;
  p_mariammah_fish uuid := md5('perlis:product:mariammah-fish-head-curry')::uuid;

  p_zon_box uuid := md5('perlis:product:zon-duty-free-chocolate-snacks-box')::uuid;
  p_borderbazaar_pack uuid := md5('perlis:product:border-bazaar-thai-malay-souvenir-pack')::uuid;

  p_srigarden_standard uuid := md5('perlis:product:sri-garden-standard-room')::uuid;
  p_srigarden_family uuid := md5('perlis:product:sri-garden-family-room')::uuid;
  p_putra_deluxe uuid := md5('perlis:product:putra-regency-deluxe-room')::uuid;
  p_putra_suite uuid := md5('perlis:product:putra-regency-suite')::uuid;

  p_taman_ular_ticket uuid := md5('perlis:product:taman-ular-entry-ticket')::uuid;

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
    (v_v_hameed, v_owner_ali, 'Hameed Nasi Kandar', 'hameed-nasi-kandar',
     'Nasi kandar restaurant in Kangar.', 'food', 'approved', now()),
    (v_v_mariammah, v_owner_raj, 'Mariammah Curry House', 'mariammah-curry-house',
     'Curry house in Kangar.', 'food', 'approved', now()),

    (v_v_zon, v_owner_siti, 'The ZON - Duty Free', 'the-zon-duty-free',
     'Duty-free supermarket in Padang Besar.', 'retail', 'approved', now()),
    (v_v_border_bazaar, v_owner_ali, 'Border Bazzar Padang Besar', 'border-bazzar-padang-besar',
     'Border bazaar supermarket in Padang Besar.', 'retail', 'approved', now()),

    (v_v_sri_garden, v_owner_raj, 'Hotel Sri Garden', 'hotel-sri-garden',
     'Hotel in Kangar.', 'accommodation', 'approved', now()),
    (v_v_putra_regency, v_owner_siti, 'Putra Regency Hotel', 'putra-regency-hotel',
     'Hotel in Kangar.', 'accommodation', 'approved', now()),

    (v_v_taman_ular_op, v_owner_ali, 'Taman Ular dan Reptilia Sungai Batu Pahat', 'taman-ular-dan-reptilia-sungai-batu-pahat',
     'Snake and reptile park near Kangar.', 'attraction', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_hameed, v_v_mariammah, v_v_zon, v_v_border_bazaar,
    v_v_sri_garden, v_v_putra_regency, v_v_taman_ular_op
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_perlis, NULL, 'state', 'Perlis', 'perlis', 'Perlis', NULL, 6.4390, 100.1975, NULL, NULL, NULL),

    (v_kangar, v_perlis, 'region', 'Kangar', 'kangar', 'Perlis', 'Kangar', 6.4370, 100.1919, NULL, NULL, NULL),
    (v_kaki_bukit, v_perlis, 'region', 'Kaki Bukit', 'kaki-bukit', 'Perlis', 'Kaki Bukit', 6.6444, 100.2031, NULL, NULL, NULL),
    (v_padang_besar, v_perlis, 'region', 'Padang Besar', 'padang-besar', 'Perlis', 'Padang Besar', 6.6612, 100.3251, NULL, NULL, NULL),

    (v_p_dataran_keris, v_kangar, 'poi', 'Dataran Keris', 'dataran-keris', 'Perlis', 'Kangar', 6.437000, 100.191900, 0, NULL, NULL),
    (v_p_taman_ular, v_kangar, 'poi', 'Taman Ular dan Reptilia', 'taman-ular-dan-reptilia', 'Perlis', 'Kangar', 6.509666, 100.174205, 10.00, v_v_taman_ular_op, NULL),
    (v_p_gua_kelam, v_kaki_bukit, 'poi', 'Gua Kelam Recreational Park', 'gua-kelam', 'Perlis', 'Kaki Bukit', 6.644400, 100.203100, 0, NULL, NULL),
    (v_p_wang_kelian, v_kaki_bukit, 'poi', 'Wang Kelian Viewpoint', 'wang-kelian-viewpoint', 'Perlis', 'Kaki Bukit', 6.665900, 100.201300, 0, NULL, NULL),
    (v_p_border_bazaar, v_padang_besar, 'poi', 'Padang Besar Border Bazaar', 'padang-besar-border-bazaar', 'Perlis', 'Padang Besar', 6.661200, 100.325100, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_hameed, v_v_hameed, 'Hameed Nasi Kandar', 'hameed-nasi-kandar', NULL, 'Kangar', 'Perlis', 6.432887, 100.196423),
    (o_mariammah, v_v_mariammah, 'Mariammah Curry House', 'mariammah-curry-house', NULL, 'Kangar', 'Perlis', 6.435965, 100.190765),

    (o_zon, v_v_zon, 'The ZON - Duty Free', 'the-zon-duty-free', NULL, 'Padang Besar', 'Perlis', 6.664148, 100.325368),
    (o_border_bazaar, v_v_border_bazaar, 'Border Bazzar Padang Besar', 'border-bazzar-padang-besar', NULL, 'Padang Besar', 'Perlis', 6.661206, 100.325067),

    (o_sri_garden, v_v_sri_garden, 'Hotel Sri Garden', 'hotel-sri-garden', NULL, 'Kangar', 'Perlis', 6.438940, 100.196690),
    (o_putra_regency, v_v_putra_regency, 'Putra Regency Hotel', 'putra-regency-hotel', NULL, 'Kangar', 'Perlis', 6.444276, 100.203158),

    (o_taman_ular, v_v_taman_ular_op, 'Taman Ular dan Reptilia', 'taman-ular-dan-reptilia', NULL, 'Kangar', 'Perlis', 6.509666, 100.174205)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_hameed_set, v_v_hameed, o_hameed, c_food, 'Nasi Kandar Set', 'hameed-nasi-kandar-set', 'Rice with mixed curry and fried chicken.', 'food', false, 9.00),
    (p_hameed_teh, v_v_hameed, o_hameed, c_food, 'Teh Tarik', 'hameed-teh-tarik', 'Pulled milk tea.', 'food', false, 2.50),
    (p_mariammah_banana, v_v_mariammah, o_mariammah, c_food, 'Banana Leaf Rice', 'mariammah-banana-leaf-rice', 'Rice served on banana leaf with mixed curries.', 'food', false, 12.00),
    (p_mariammah_fish, v_v_mariammah, o_mariammah, c_food, 'Fish Head Curry', 'mariammah-fish-head-curry', 'Fish head simmered in spiced curry.', 'food', false, 28.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_zon_box, v_v_zon, o_zon, c_retail, 'Duty-Free Chocolate & Snacks Box', 'zon-duty-free-chocolate-snacks-box', 'Boxed assorted chocolates and snacks, duty-free.', 'product', false, 30.00),
    (p_borderbazaar_pack, v_v_border_bazaar, o_border_bazaar, c_retail, 'Thai-Malay Souvenir Pack', 'border-bazaar-thai-malay-souvenir-pack', 'Assorted Thai and Malay border-town souvenirs.', 'product', false, 25.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_srigarden_standard, v_v_sri_garden, o_sri_garden, c_accommodation, 'Standard Room', 'sri-garden-standard-room', 'Standard room at Hotel Sri Garden.', 'service', true, 85.00),
    (p_srigarden_family, v_v_sri_garden, o_sri_garden, c_accommodation, 'Family Room', 'sri-garden-family-room', 'Family room at Hotel Sri Garden.', 'service', true, 130.00),
    (p_putra_deluxe, v_v_putra_regency, o_putra_regency, c_accommodation, 'Deluxe Room', 'putra-regency-deluxe-room', 'Deluxe room at Putra Regency Hotel.', 'service', true, 120.00),
    (p_putra_suite, v_v_putra_regency, o_putra_regency, c_accommodation, 'Suite', 'putra-regency-suite', 'Suite at Putra Regency Hotel.', 'service', true, 220.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_taman_ular_ticket, v_v_taman_ular_op, o_taman_ular, c_activity, 'Entry Ticket', 'taman-ular-entry-ticket', 'Entry to Taman Ular dan Reptilia.', 'activity', true, 10.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('perlis:variant:srigarden-standard')::uuid, p_srigarden_standard, 'Room Only', 0, true),
    (md5('perlis:variant:srigarden-family')::uuid, p_srigarden_family, 'Room Only', 0, true),
    (md5('perlis:variant:putra-deluxe')::uuid, p_putra_deluxe, 'Room Only', 0, true),
    (md5('perlis:variant:putra-suite')::uuid, p_putra_suite, 'Room Only', 0, true),
    (md5('perlis:variant:zon-box')::uuid, p_zon_box, 'Standard', 0, true),
    (md5('perlis:variant:borderbazaar-pack')::uuid, p_borderbazaar_pack, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_zon_box, p_borderbazaar_pack)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_zon_box, v_p_border_bazaar, 'addon'),
    (p_borderbazaar_pack, v_p_border_bazaar, 'addon'),
    (p_taman_ular_ticket, v_p_taman_ular, 'admission')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- Historical replay — fabricated demo data attached to real business
  -- names. All 11 products have outlets (no guide_service vendor exists in
  -- this state). 2 orders per food/attraction product, 1 per
  -- accommodation/retail. Guarded by ORD-PL-SEED.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-PL-SEED') THEN

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
          (p_hameed_set, v_v_hameed, o_hameed, 'Nasi Kandar Set', 9.00::numeric, false, 2),
          (p_hameed_teh, v_v_hameed, o_hameed, 'Teh Tarik', 2.50::numeric, false, 2),
          (p_mariammah_banana, v_v_mariammah, o_mariammah, 'Banana Leaf Rice', 12.00::numeric, false, 2),
          (p_mariammah_fish, v_v_mariammah, o_mariammah, 'Fish Head Curry', 28.00::numeric, false, 2),

          (p_taman_ular_ticket, v_v_taman_ular_op, o_taman_ular, 'Entry Ticket', 10.00::numeric, true, 2),

          (p_zon_box, v_v_zon, o_zon, 'Duty-Free Chocolate & Snacks Box', 30.00::numeric, false, 1),
          (p_borderbazaar_pack, v_v_border_bazaar, o_border_bazaar, 'Thai-Malay Souvenir Pack', 25.00::numeric, false, 1),

          (p_srigarden_standard, v_v_sri_garden, o_sri_garden, 'Standard Room', 85.00::numeric, true, 1),
          (p_srigarden_family, v_v_sri_garden, o_sri_garden, 'Family Room', 130.00::numeric, true, 1),
          (p_putra_deluxe, v_v_putra_regency, o_putra_regency, 'Deluxe Room', 120.00::numeric, true, 1),
          (p_putra_suite, v_v_putra_regency, o_putra_regency, 'Suite', 220.00::numeric, true, 1)
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
            UPDATE orders SET display_id = 'ORD-PL-SEED' WHERE id = v_order_id;
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
    SELECT vendor_id FROM outlets WHERE state = 'Perlis');
  IF n <> 7 THEN RAISE EXCEPTION 'expected 7 Perlis vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Perlis';
  IF n <> 7 THEN RAISE EXCEPTION 'expected 7 Perlis outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE v.id IN (SELECT vendor_id FROM outlets WHERE state = 'Perlis');
  IF n <> 11 THEN RAISE EXCEPTION 'expected 11 Perlis products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Perlis'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Perlis products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Perlis';
  IF n <> 9 THEN RAISE EXCEPTION 'expected 9 Perlis places (1 state + 3 regions + 5 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Perlis';
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 Perlis product_places links, found %', n; END IF;
END $$;

COMMIT;
