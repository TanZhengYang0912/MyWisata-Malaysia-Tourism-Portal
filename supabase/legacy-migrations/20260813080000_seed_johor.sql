-- Johor place model — seed data.
-- See docs/plans/2026-08-14-1431-johor-real-business-seed.md
--
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real Johor
-- businesses sourced from OpenStreetMap —
-- © OpenStreetMap contributors, ODbL v1.0
-- (https://www.openstreetmap.org/copyright).
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, order items, bookings,
-- reviews, ratings, revenue and wallet balances in section 9 are randomly
-- generated demo content for an academic project. They do not describe,
-- and must not be read as describing, the real businesses named here.
-- No business listed has any relationship with this platform.
--
-- NO EXCEPTIONS: every vendor, outlet, name, address and coordinate below
-- is a real Johor business sourced from OpenStreetMap. The guide-service
-- products belong to 3 real licensed travel agencies (shop=travel_agency);
-- their itineraries and prices are plausible demo content, not those
-- agencies' actual catalogues. Their outlet_id IS NULL is deliberate —
-- the "no premises" case lives on the product, not the vendor.
--
-- Multinational chains (M&S, Parkson, Pizza Hut, Starbucks) appeared in
-- Overpass results and were rejected — local independents only.
--
-- category_id resolved once via c_food/c_activity/c_accommodation/c_retail
-- variables, matching the Melaka/Pahang reseed pattern.

BEGIN;

DO $$
DECLARE
  v_johor uuid := md5('johor:place:johor')::uuid;
  v_jb uuid := md5('johor:place:johor-bahru')::uuid;
  v_danga uuid := md5('johor:place:danga-bay')::uuid;
  v_legoland uuid := md5('johor:place:legoland')::uuid;
  v_kota_tinggi uuid := md5('johor:place:kota-tinggi')::uuid;
  v_muar uuid := md5('johor:place:muar')::uuid;
  v_mersing uuid := md5('johor:place:mersing')::uuid;
  v_desaru uuid := md5('johor:place:desaru')::uuid;

  v_p_mosque uuid := md5('johor:place:sultan-abu-bakar-mosque')::uuid;
  v_p_zoo uuid := md5('johor:place:zoo-johor')::uuid;
  v_p_city_square uuid := md5('johor:place:jb-city-square')::uuid;
  v_p_istana uuid := md5('johor:place:istana-bukit-serene')::uuid;
  v_p_danga_waterfront uuid := md5('johor:place:danga-bay-waterfront')::uuid;
  v_p_legoland_park uuid := md5('johor:place:legoland-malaysia')::uuid;
  v_p_legoland_water uuid := md5('johor:place:legoland-waterpark')::uuid;
  v_p_kt_waterfalls uuid := md5('johor:place:kota-tinggi-waterfalls')::uuid;
  v_p_kt_firefly uuid := md5('johor:place:kota-tinggi-firefly-park')::uuid;
  v_p_kt_museum uuid := md5('johor:place:muzium-kota-tinggi')::uuid;
  v_p_muar_clock uuid := md5('johor:place:muar-clock-tower')::uuid;
  v_p_mersing_jetty uuid := md5('johor:place:mersing-jetty')::uuid;
  v_p_desaru_ostrich uuid := md5('johor:place:desaru-ostrich-farm')::uuid;

  v_v_ah_piaw uuid := md5('johor:vendor:food-restoran-ah-piaw')::uuid;
  v_v_kakilang uuid := md5('johor:vendor:food-kakilang-kopitiam')::uuid;
  v_v_mariners uuid := md5('johor:vendor:food-mariners-cafe')::uuid;
  v_v_chaiwalla uuid := md5('johor:vendor:food-chaiwalla-and-co')::uuid;
  v_v_wah_san uuid := md5('johor:vendor:food-restoran-wah-san')::uuid;
  v_v_sam_kee uuid := md5('johor:vendor:food-sam-kee-kopitiam')::uuid;
  v_v_mersing_seafood uuid := md5('johor:vendor:food-mersing-seafood-restaurant')::uuid;
  v_v_ee_lo uuid := md5('johor:vendor:food-restaurant-ee-lo')::uuid;

  v_v_hiap_joo uuid := md5('johor:vendor:retail-hiap-joo-bakery')::uuid;

  v_v_nz_world uuid := md5('johor:vendor:guide-nz-world-travels')::uuid;
  v_v_sri_daya uuid := md5('johor:vendor:guide-sri-daya-travels')::uuid;
  v_v_island_connection uuid := md5('johor:vendor:guide-island-connection-travel-tours')::uuid;

  v_v_legoland_resort uuid := md5('johor:vendor:op-legoland-malaysia-resort')::uuid;

  v_v_hotel_ciq uuid := md5('johor:vendor:accom-hotel-ciq')::uuid;
  v_v_thistle uuid := md5('johor:vendor:accom-thistle-johor-bahru')::uuid;
  v_v_legoland_hotel uuid := md5('johor:vendor:accom-legoland-hotel-malaysia')::uuid;
  v_v_timotel uuid := md5('johor:vendor:accom-timotel-hotel')::uuid;
  v_v_hotel_classic uuid := md5('johor:vendor:accom-hotel-classic-muar')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_ah_piaw uuid := md5('johor:outlet:ah-piaw-jb')::uuid;
  o_kakilang uuid := md5('johor:outlet:kakilang-kopitiam-jb')::uuid;
  o_mariners uuid := md5('johor:outlet:mariners-cafe-jb')::uuid;
  o_chaiwalla uuid := md5('johor:outlet:chaiwalla-jb')::uuid;
  o_wah_san uuid := md5('johor:outlet:wah-san-muar')::uuid;
  o_sam_kee uuid := md5('johor:outlet:sam-kee-muar')::uuid;
  o_mersing_seafood uuid := md5('johor:outlet:mersing-seafood')::uuid;
  o_ee_lo uuid := md5('johor:outlet:ee-lo-mersing')::uuid;

  o_hiap_joo uuid := md5('johor:outlet:hiap-joo-jb')::uuid;

  o_nz_world uuid := md5('johor:outlet:nz-world-travels-jb')::uuid;
  o_sri_daya uuid := md5('johor:outlet:sri-daya-travels-jb')::uuid;
  o_island_connection uuid := md5('johor:outlet:island-connection-mersing')::uuid;

  o_legoland_counter uuid := md5('johor:outlet:legoland-resort-counter')::uuid;

  o_hotel_ciq uuid := md5('johor:outlet:hotel-ciq-jb')::uuid;
  o_thistle uuid := md5('johor:outlet:thistle-jb')::uuid;
  o_legoland_hotel uuid := md5('johor:outlet:legoland-hotel')::uuid;
  o_timotel uuid := md5('johor:outlet:timotel-mersing')::uuid;
  o_hotel_classic uuid := md5('johor:outlet:hotel-classic-muar')::uuid;

  p_ah_piaw_mee uuid := md5('johor:product:ah-piaw-wanton-mee')::uuid;
  p_ah_piaw_soup uuid := md5('johor:product:ah-piaw-wonton-soup')::uuid;
  p_kakilang_nasi uuid := md5('johor:product:kakilang-nasi-lemak-set')::uuid;
  p_kakilang_teh uuid := md5('johor:product:kakilang-teh-tarik')::uuid;
  p_mariners_fish uuid := md5('johor:product:mariners-fish-and-chips')::uuid;
  p_mariners_coffee uuid := md5('johor:product:mariners-flat-white')::uuid;
  p_chaiwalla_chai uuid := md5('johor:product:chaiwalla-masala-chai-set')::uuid;
  p_chaiwalla_naan uuid := md5('johor:product:chaiwalla-cheese-naan')::uuid;
  p_wah_san_mee uuid := md5('johor:product:wah-san-mee-bandung-muar')::uuid;
  p_wah_san_lime uuid := md5('johor:product:wah-san-iced-lime')::uuid;
  p_sam_kee_curry uuid := md5('johor:product:sam-kee-curry-mee')::uuid;
  p_sam_kee_kopi uuid := md5('johor:product:sam-kee-kopi-o')::uuid;
  p_ms_prawns uuid := md5('johor:product:mersing-seafood-butter-prawns')::uuid;
  p_ms_fish uuid := md5('johor:product:mersing-seafood-steamed-fish')::uuid;
  p_eelo_squid uuid := md5('johor:product:eelo-salted-egg-squid')::uuid;
  p_eelo_tofu uuid := md5('johor:product:eelo-claypot-tofu')::uuid;

  p_hj_banana uuid := md5('johor:product:hiap-joo-original-banana-cake')::uuid;
  p_hj_chocolate uuid := md5('johor:product:hiap-joo-chocolate-marble-cake')::uuid;

  p_guide_jb_walk uuid := md5('johor:product:guide-jb-heritage-city-walk')::uuid;
  p_guide_danga_tour uuid := md5('johor:product:guide-danga-bay-waterfront-tour')::uuid;
  p_guide_island_hop uuid := md5('johor:product:guide-tioman-seribuat-island-hop')::uuid;

  p_legoland_theme uuid := md5('johor:product:legoland-theme-park-ticket')::uuid;
  p_legoland_water uuid := md5('johor:product:legoland-waterpark-ticket')::uuid;

  p_ciq_single uuid := md5('johor:product:ciq-budget-single')::uuid;
  p_ciq_twin uuid := md5('johor:product:ciq-budget-twin')::uuid;
  p_thistle_deluxe uuid := md5('johor:product:thistle-deluxe-room')::uuid;
  p_thistle_club uuid := md5('johor:product:thistle-club-room')::uuid;
  p_legoland_pirate uuid := md5('johor:product:legoland-pirate-room')::uuid;
  p_legoland_adventure uuid := md5('johor:product:legoland-adventure-room')::uuid;
  p_timotel_standard uuid := md5('johor:product:timotel-standard-room')::uuid;
  p_timotel_deluxe uuid := md5('johor:product:timotel-deluxe-room')::uuid;
  p_classic_standard uuid := md5('johor:product:hotel-classic-standard-room')::uuid;
  p_classic_family uuid := md5('johor:product:hotel-classic-family-room')::uuid;

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
    (v_v_ah_piaw, v_owner_ali, 'Restoran Ah Piaw (Wanton Mee)', 'restoran-ah-piaw',
     'Wanton mee stall in Johor Bahru.', 'food', 'approved', now()),
    (v_v_kakilang, v_owner_raj, 'Kakilang Kopitiam', 'kakilang-kopitiam',
     'Traditional kopitiam in Johor Bahru.', 'food', 'approved', now()),
    (v_v_mariners, v_owner_siti, 'Mariners Cafe', 'mariners-cafe',
     'Café near Johor Bahru City Square.', 'food', 'approved', now()),
    (v_v_chaiwalla, v_owner_ali, 'Chaiwalla & Co', 'chaiwalla-and-co',
     'Indian tea and light bites café in Johor Bahru.', 'food', 'approved', now()),
    (v_v_wah_san, v_owner_raj, 'Restoran Wah San', 'restoran-wah-san',
     'Mee Bandung Muar restaurant, a Muar signature dish.', 'food', 'approved', now()),
    (v_v_sam_kee, v_owner_siti, 'Sam Kee Kopitiam', 'sam-kee-kopitiam',
     'Traditional kopitiam in Muar.', 'food', 'approved', now()),
    (v_v_mersing_seafood, v_owner_ali, 'Mersing Seafood Restaurant', 'mersing-seafood-restaurant',
     'Seafood restaurant near the Mersing jetty.', 'food', 'approved', now()),
    (v_v_ee_lo, v_owner_raj, 'Restaurant Ee Lo', 'restaurant-ee-lo',
     'Restaurant near the Mersing jetty.', 'food', 'approved', now()),

    (v_v_hiap_joo, v_owner_siti, 'Hiap Joo Bakery', 'hiap-joo-bakery',
     'Wood-fired banana cake bakery in Johor Bahru.', 'retail', 'approved', now()),

    (v_v_nz_world, v_owner_ali, 'NZ World Travels', 'nz-world-travels',
     'Licensed travel agency in Johor Bahru.', 'activity', 'approved', now()),
    (v_v_sri_daya, v_owner_raj, 'Sri Daya Travels', 'sri-daya-travels',
     'Licensed travel agency in Johor Bahru.', 'activity', 'approved', now()),
    (v_v_island_connection, v_owner_siti, 'Island Connection Travel Tours', 'island-connection-travel-tours',
     'Licensed travel agency at the Mersing jetty, gateway to Tioman and the Seribuat islands.', 'activity', 'approved', now()),

    (v_v_legoland_resort, v_owner_ali, 'LEGOLAND Malaysia Resort', 'legoland-malaysia-resort',
     'Operator of Legoland Malaysia theme park and waterpark.', 'attraction', 'approved', now()),

    (v_v_hotel_ciq, v_owner_raj, 'Hotel CIQ', 'hotel-ciq',
     'Budget hotel near the Johor Bahru CIQ checkpoint.', 'accommodation', 'approved', now()),
    (v_v_thistle, v_owner_siti, 'Thistle Johor Bahru', 'thistle-johor-bahru',
     'Hotel in Johor Bahru.', 'accommodation', 'approved', now()),
    (v_v_legoland_hotel, v_owner_ali, 'Legoland Hotel Malaysia', 'legoland-hotel-malaysia',
     'Themed hotel at Legoland Malaysia Resort.', 'accommodation', 'approved', now()),
    (v_v_timotel, v_owner_raj, 'Timotel Hotel', 'timotel-hotel',
     'Hotel near the Mersing jetty.', 'accommodation', 'approved', now()),
    (v_v_hotel_classic, v_owner_siti, 'Hotel Classic', 'hotel-classic-muar',
     'Hotel in Muar.', 'accommodation', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_ah_piaw, v_v_kakilang, v_v_mariners, v_v_chaiwalla, v_v_wah_san, v_v_sam_kee,
    v_v_mersing_seafood, v_v_ee_lo, v_v_hiap_joo, v_v_nz_world, v_v_sri_daya,
    v_v_island_connection, v_v_legoland_resort, v_v_hotel_ciq, v_v_thistle,
    v_v_legoland_hotel, v_v_timotel, v_v_hotel_classic
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_johor, NULL, 'state', 'Johor', 'johor', 'Johor', NULL, 1.4617, 103.7640, NULL, NULL, NULL),

    (v_jb, v_johor, 'region', 'Johor Bahru', 'johor-bahru', 'Johor', 'Johor Bahru', 1.4617, 103.7640, NULL, NULL, NULL),
    (v_danga, v_johor, 'region', 'Danga Bay', 'danga-bay', 'Johor', 'Danga Bay', 1.4734, 103.7248, NULL, NULL, NULL),
    (v_legoland, v_johor, 'region', 'Legoland', 'legoland', 'Johor', 'Legoland', 1.4270, 103.6300, NULL, NULL, NULL),
    (v_kota_tinggi, v_johor, 'region', 'Kota Tinggi', 'kota-tinggi', 'Johor', 'Kota Tinggi', 1.7300, 103.9100, NULL, NULL, NULL),
    (v_muar, v_johor, 'region', 'Muar', 'muar', 'Johor', 'Muar', 2.0450, 102.5680, NULL, NULL, NULL),
    (v_mersing, v_johor, 'region', 'Mersing', 'mersing', 'Johor', 'Mersing', 2.4310, 103.8370, NULL, NULL, NULL),
    (v_desaru, v_johor, 'region', 'Desaru', 'desaru', 'Johor', 'Desaru', 1.3700, 104.2400, NULL, NULL, NULL),

    (v_p_mosque, v_jb, 'poi', 'Sultan Abu Bakar Mosque', 'sultan-abu-bakar-mosque', 'Johor', 'Johor Bahru', 1.456847, 103.751269, 0, NULL, NULL),
    (v_p_zoo, v_jb, 'poi', 'Zoo Johor', 'zoo-johor', 'Johor', 'Johor Bahru', 1.457508, 103.752018, 0, NULL, NULL),
    (v_p_city_square, v_jb, 'poi', 'Johor Bahru City Square', 'jb-city-square', 'Johor', 'Johor Bahru', 1.461701, 103.763985, 0, NULL, NULL),
    (v_p_istana, v_jb, 'poi', 'Istana Bukit Serene', 'istana-bukit-serene', 'Johor', 'Johor Bahru', 1.479797, 103.726369, 0, NULL, NULL),
    (v_p_danga_waterfront, v_danga, 'poi', 'Danga Bay Waterfront', 'danga-bay-waterfront', 'Johor', 'Danga Bay', 1.473440, 103.724764, 0, NULL, NULL),
    (v_p_legoland_park, v_legoland, 'poi', 'Legoland Malaysia', 'legoland-malaysia', 'Johor', 'Legoland', 1.427720, 103.628863, 60.00, v_v_legoland_resort, NULL),
    (v_p_legoland_water, v_legoland, 'poi', 'Legoland Waterpark', 'legoland-waterpark', 'Johor', 'Legoland', 1.425499, 103.630384, 55.00, v_v_legoland_resort, NULL),
    (v_p_kt_waterfalls, v_kota_tinggi, 'poi', 'Kota Tinggi Waterfalls', 'kota-tinggi-waterfalls', 'Johor', 'Kota Tinggi', 1.830415, 103.832240, 0, NULL, NULL),
    (v_p_kt_firefly, v_kota_tinggi, 'poi', 'Kota Tinggi Firefly Park', 'kota-tinggi-firefly-park', 'Johor', 'Kota Tinggi', 1.726945, 103.911462, 0, NULL, NULL),
    (v_p_kt_museum, v_kota_tinggi, 'poi', 'Muzium Kota Tinggi', 'muzium-kota-tinggi', 'Johor', 'Kota Tinggi', 1.737331, 103.912226, 0, NULL, NULL),
    (v_p_muar_clock, v_muar, 'poi', 'Muar Clock Tower / Tanjung Emas', 'muar-clock-tower', 'Johor', 'Muar', 2.048839, 102.568847, 0, NULL, NULL),
    (v_p_mersing_jetty, v_mersing, 'poi', 'Mersing Jetty', 'mersing-jetty', 'Johor', 'Mersing', 2.434587, 103.838810, 0, NULL, NULL),
    (v_p_desaru_ostrich, v_desaru, 'poi', 'Desaru Ostrich Farm', 'desaru-ostrich-farm', 'Johor', 'Desaru', 1.369716, 104.241212, 0, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_ah_piaw, v_v_ah_piaw, 'Restoran Ah Piaw (Wanton Mee)', 'ah-piaw-jb', NULL, 'Johor Bahru', 'Johor', 1.486797, 103.769202),
    (o_kakilang, v_v_kakilang, 'Kakilang Kopitiam', 'kakilang-kopitiam-jb', NULL, 'Johor Bahru', 'Johor', 1.482494, 103.767041),
    (o_mariners, v_v_mariners, 'Mariners Cafe', 'mariners-cafe-jb', NULL, 'Johor Bahru', 'Johor', 1.456507, 103.763678),
    (o_chaiwalla, v_v_chaiwalla, 'Chaiwalla & Co', 'chaiwalla-jb', NULL, 'Johor Bahru', 'Johor', 1.456497, 103.764007),
    (o_wah_san, v_v_wah_san, 'Restoran Wah San', 'wah-san-muar', NULL, 'Muar', 'Johor', 2.046491, 102.566379),
    (o_sam_kee, v_v_sam_kee, 'Sam Kee Kopitiam', 'sam-kee-muar', NULL, 'Muar', 'Johor', 2.042341, 102.565273),
    (o_mersing_seafood, v_v_mersing_seafood, 'Mersing Seafood Restaurant', 'mersing-seafood', NULL, 'Mersing', 'Johor', 2.429745, 103.837024),
    (o_ee_lo, v_v_ee_lo, 'Restaurant Ee Lo', 'ee-lo-mersing', NULL, 'Mersing', 'Johor', 2.431224, 103.837402),

    (o_hiap_joo, v_v_hiap_joo, 'Hiap Joo Bakery', 'hiap-joo-jb', NULL, 'Johor Bahru', 'Johor', 1.456669, 103.764355),

    (o_nz_world, v_v_nz_world, 'NZ World Travels', 'nz-world-travels-jb', NULL, 'Johor Bahru', 'Johor', 1.462587, 103.762740),
    (o_sri_daya, v_v_sri_daya, 'Sri Daya Travels', 'sri-daya-travels-jb', NULL, 'Johor Bahru', 'Johor', 1.456924, 103.763392),
    (o_island_connection, v_v_island_connection, 'Island Connection Travel Tours', 'island-connection-mersing', NULL, 'Mersing', 'Johor', 2.430847, 103.833511),

    (o_legoland_counter, v_v_legoland_resort, 'LEGOLAND Malaysia Resort — Guest Services', 'legoland-resort-counter', NULL, 'Legoland', 'Johor', 1.427720, 103.628863),

    (o_hotel_ciq, v_v_hotel_ciq, 'Hotel CIQ', 'hotel-ciq-jb', NULL, 'Johor Bahru', 'Johor', 1.458246, 103.765860),
    (o_thistle, v_v_thistle, 'Thistle Johor Bahru', 'thistle-jb', 'Jalan Sungai Chat', 'Johor Bahru', 'Johor', 1.462379, 103.743372),
    (o_legoland_hotel, v_v_legoland_hotel, 'Legoland Hotel Malaysia', 'legoland-hotel', NULL, 'Legoland', 'Johor', 1.426892, 103.631709),
    (o_timotel, v_v_timotel, 'Timotel Hotel', 'timotel-mersing', NULL, 'Mersing', 'Johor', 2.432938, 103.834226),
    (o_hotel_classic, v_v_hotel_classic, 'Hotel Classic', 'hotel-classic-muar', NULL, 'Muar', 'Johor', 2.044490, 102.566311)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_ah_piaw_mee, v_v_ah_piaw, o_ah_piaw, c_food, 'Wanton Mee', 'ah-piaw-wanton-mee', 'Springy egg noodles with char siu and wontons.', 'food', false, 9.00),
    (p_ah_piaw_soup, v_v_ah_piaw, o_ah_piaw, c_food, 'Wonton Soup', 'ah-piaw-wonton-soup', 'Pork and prawn wontons in clear broth.', 'food', false, 6.00),
    (p_kakilang_nasi, v_v_kakilang, o_kakilang, c_food, 'Nasi Lemak Set', 'kakilang-nasi-lemak-set', 'Coconut rice with sambal, egg and anchovies.', 'food', false, 8.50),
    (p_kakilang_teh, v_v_kakilang, o_kakilang, c_food, 'Teh Tarik', 'kakilang-teh-tarik', 'Hand-pulled milk tea.', 'food', false, 3.00),
    (p_mariners_fish, v_v_mariners, o_mariners, c_food, 'Fish & Chips', 'mariners-fish-and-chips', 'Battered fish with hand-cut fries.', 'food', false, 24.00),
    (p_mariners_coffee, v_v_mariners, o_mariners, c_food, 'Flat White', 'mariners-flat-white', 'Espresso with steamed milk.', 'food', false, 12.00),
    (p_chaiwalla_chai, v_v_chaiwalla, o_chaiwalla, c_food, 'Masala Chai Set', 'chaiwalla-masala-chai-set', 'Spiced milk tea with a savoury snack.', 'food', false, 10.00),
    (p_chaiwalla_naan, v_v_chaiwalla, o_chaiwalla, c_food, 'Cheese Naan', 'chaiwalla-cheese-naan', 'Tandoor-baked naan with melted cheese.', 'food', false, 8.00),
    (p_wah_san_mee, v_v_wah_san, o_wah_san, c_food, 'Mee Bandung Muar', 'wah-san-mee-bandung-muar', 'Muar''s signature spiced noodle dish.', 'food', false, 9.00),
    (p_wah_san_lime, v_v_wah_san, o_wah_san, c_food, 'Iced Lime', 'wah-san-iced-lime', 'Fresh calamansi lime juice over ice.', 'food', false, 3.50),
    (p_sam_kee_curry, v_v_sam_kee, o_sam_kee, c_food, 'Curry Mee', 'sam-kee-curry-mee', 'Noodles in coconut curry broth.', 'food', false, 8.00),
    (p_sam_kee_kopi, v_v_sam_kee, o_sam_kee, c_food, 'Kopi-O', 'sam-kee-kopi-o', 'Black coffee, wok-roasted beans.', 'food', false, 2.80),
    (p_ms_prawns, v_v_mersing_seafood, o_mersing_seafood, c_food, 'Butter Prawns', 'mersing-seafood-butter-prawns', 'Prawns fried in a butter curry-leaf sauce.', 'food', false, 42.00),
    (p_ms_fish, v_v_mersing_seafood, o_mersing_seafood, c_food, 'Steamed Fish', 'mersing-seafood-steamed-fish', 'Whole fish steamed with ginger and scallion.', 'food', false, 48.00),
    (p_eelo_squid, v_v_ee_lo, o_ee_lo, c_food, 'Salted Egg Squid', 'eelo-salted-egg-squid', 'Crispy squid tossed in salted egg yolk.', 'food', false, 28.00),
    (p_eelo_tofu, v_v_ee_lo, o_ee_lo, c_food, 'Claypot Tofu', 'eelo-claypot-tofu', 'Silken tofu braised with seafood in a claypot.', 'food', false, 16.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_hj_banana, v_v_hiap_joo, o_hiap_joo, c_retail, 'Original Banana Cake', 'hiap-joo-original-banana-cake', 'Wood-fired banana cake, Hiap Joo''s signature.', 'product', false, 15.00),
    (p_hj_chocolate, v_v_hiap_joo, o_hiap_joo, c_retail, 'Chocolate Marble Cake', 'hiap-joo-chocolate-marble-cake', 'Marbled chocolate and vanilla loaf cake.', 'product', false, 16.00)
  ON CONFLICT (id) DO NOTHING;

  -- Guide services — outlet_id NULL, place-bound only. Real vendors (3
  -- licensed travel agencies), fictional itinerary names — see plan §2.2.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_guide_jb_walk, v_v_nz_world, NULL, c_activity, 'JB Heritage City Walk', 'guide-jb-heritage-city-walk', 'Guided walk through Johor Bahru''s heritage core.', 'experience', true, 65.00),
    (p_guide_danga_tour, v_v_sri_daya, NULL, c_activity, 'Danga Bay Waterfront Tour', 'guide-danga-bay-waterfront-tour', 'Guided tour of the Danga Bay waterfront.', 'experience', true, 55.00),
    (p_guide_island_hop, v_v_island_connection, NULL, c_activity, 'Tioman & Seribuat Island Hop', 'guide-tioman-seribuat-island-hop', 'Guided boat trip to the Tioman and Seribuat islands.', 'experience', true, 220.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_legoland_theme, v_v_legoland_resort, o_legoland_counter, c_activity, 'Legoland Malaysia Theme Park Ticket', 'legoland-theme-park-ticket', 'One-day entry to Legoland Malaysia theme park.', 'activity', true, 60.00),
    (p_legoland_water, v_v_legoland_resort, o_legoland_counter, c_activity, 'Legoland Waterpark Ticket', 'legoland-waterpark-ticket', 'One-day entry to Legoland Waterpark.', 'activity', true, 55.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_ciq_single, v_v_hotel_ciq, o_hotel_ciq, c_accommodation, 'CIQ Budget Single', 'ciq-budget-single', 'Single room near the CIQ checkpoint.', 'service', true, 65.00),
    (p_ciq_twin, v_v_hotel_ciq, o_hotel_ciq, c_accommodation, 'CIQ Budget Twin', 'ciq-budget-twin', 'Twin room near the CIQ checkpoint.', 'service', true, 85.00),
    (p_thistle_deluxe, v_v_thistle, o_thistle, c_accommodation, 'Thistle Deluxe Room', 'thistle-deluxe-room', 'Deluxe room at Thistle Johor Bahru.', 'service', true, 220.00),
    (p_thistle_club, v_v_thistle, o_thistle, c_accommodation, 'Thistle Club Room', 'thistle-club-room', 'Club room with lounge access.', 'service', true, 320.00),
    (p_legoland_pirate, v_v_legoland_hotel, o_legoland_hotel, c_accommodation, 'Legoland Pirate Room', 'legoland-pirate-room', 'Pirate-themed room at Legoland Hotel.', 'service', true, 680.00),
    (p_legoland_adventure, v_v_legoland_hotel, o_legoland_hotel, c_accommodation, 'Legoland Adventure Room', 'legoland-adventure-room', 'Adventure-themed room at Legoland Hotel.', 'service', true, 720.00),
    (p_timotel_standard, v_v_timotel, o_timotel, c_accommodation, 'Timotel Standard Room', 'timotel-standard-room', 'Standard room near the Mersing jetty.', 'service', true, 120.00),
    (p_timotel_deluxe, v_v_timotel, o_timotel, c_accommodation, 'Timotel Deluxe Room', 'timotel-deluxe-room', 'Deluxe room near the Mersing jetty.', 'service', true, 160.00),
    (p_classic_standard, v_v_hotel_classic, o_hotel_classic, c_accommodation, 'Hotel Classic Standard Room', 'hotel-classic-standard-room', 'Standard room in Muar.', 'service', true, 90.00),
    (p_classic_family, v_v_hotel_classic, o_hotel_classic, c_accommodation, 'Hotel Classic Family Room', 'hotel-classic-family-room', 'Family room in Muar.', 'service', true, 140.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('johor:variant:ciq-single-standard')::uuid, p_ciq_single, 'Standard', 0, true),
    (md5('johor:variant:ciq-twin-standard')::uuid, p_ciq_twin, 'Standard', 0, true),
    (md5('johor:variant:thistle-deluxe-room-only')::uuid, p_thistle_deluxe, 'Room Only', 0, true),
    (md5('johor:variant:thistle-deluxe-breakfast')::uuid, p_thistle_deluxe, 'Breakfast Included', 35, false),
    (md5('johor:variant:thistle-club-room-only')::uuid, p_thistle_club, 'Room Only', 0, true),
    (md5('johor:variant:legoland-pirate-room-only')::uuid, p_legoland_pirate, 'Room Only', 0, true),
    (md5('johor:variant:legoland-adventure-room-only')::uuid, p_legoland_adventure, 'Room Only', 0, true),
    (md5('johor:variant:timotel-standard-room-only')::uuid, p_timotel_standard, 'Standard', 0, true),
    (md5('johor:variant:timotel-standard-breakfast')::uuid, p_timotel_standard, 'Breakfast Included', 20, false),
    (md5('johor:variant:timotel-deluxe-standard')::uuid, p_timotel_deluxe, 'Standard', 0, true),
    (md5('johor:variant:classic-standard-room')::uuid, p_classic_standard, 'Standard', 0, true),
    (md5('johor:variant:classic-family-room')::uuid, p_classic_family, 'Standard', 0, true),
    (md5('johor:variant:hj-banana-standard')::uuid, p_hj_banana, 'Standard', 0, true),
    (md5('johor:variant:hj-chocolate-standard')::uuid, p_hj_chocolate, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_hj_banana, p_hj_chocolate)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_guide_jb_walk, v_p_city_square, 'guide_service'),
    (p_guide_danga_tour, v_p_city_square, 'guide_service'),
    (p_guide_island_hop, v_p_mersing_jetty, 'guide_service'),
    (p_legoland_theme, v_p_legoland_park, 'admission'),
    (p_legoland_water, v_p_legoland_water, 'admission')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- Historical replay — fabricated demo data attached to real business
  -- names (see header disclaimer). Excludes the 3 guide products (outlet_id
  -- IS NULL). 2 orders per food/attraction-operator product, 1 per
  -- accommodation/retail product.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-JH-SEED') THEN

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
          (p_ah_piaw_mee, v_v_ah_piaw, o_ah_piaw, 'Wanton Mee', 9.00::numeric, false, 2),
          (p_ah_piaw_soup, v_v_ah_piaw, o_ah_piaw, 'Wonton Soup', 6.00::numeric, false, 2),
          (p_kakilang_nasi, v_v_kakilang, o_kakilang, 'Nasi Lemak Set', 8.50::numeric, false, 2),
          (p_kakilang_teh, v_v_kakilang, o_kakilang, 'Teh Tarik', 3.00::numeric, false, 2),
          (p_mariners_fish, v_v_mariners, o_mariners, 'Fish & Chips', 24.00::numeric, false, 2),
          (p_mariners_coffee, v_v_mariners, o_mariners, 'Flat White', 12.00::numeric, false, 2),
          (p_chaiwalla_chai, v_v_chaiwalla, o_chaiwalla, 'Masala Chai Set', 10.00::numeric, false, 2),
          (p_chaiwalla_naan, v_v_chaiwalla, o_chaiwalla, 'Cheese Naan', 8.00::numeric, false, 2),
          (p_wah_san_mee, v_v_wah_san, o_wah_san, 'Mee Bandung Muar', 9.00::numeric, false, 2),
          (p_wah_san_lime, v_v_wah_san, o_wah_san, 'Iced Lime', 3.50::numeric, false, 2),
          (p_sam_kee_curry, v_v_sam_kee, o_sam_kee, 'Curry Mee', 8.00::numeric, false, 2),
          (p_sam_kee_kopi, v_v_sam_kee, o_sam_kee, 'Kopi-O', 2.80::numeric, false, 2),
          (p_ms_prawns, v_v_mersing_seafood, o_mersing_seafood, 'Butter Prawns', 42.00::numeric, false, 2),
          (p_ms_fish, v_v_mersing_seafood, o_mersing_seafood, 'Steamed Fish', 48.00::numeric, false, 2),
          (p_eelo_squid, v_v_ee_lo, o_ee_lo, 'Salted Egg Squid', 28.00::numeric, false, 2),
          (p_eelo_tofu, v_v_ee_lo, o_ee_lo, 'Claypot Tofu', 16.00::numeric, false, 2),

          (p_legoland_theme, v_v_legoland_resort, o_legoland_counter, 'Legoland Malaysia Theme Park Ticket', 60.00::numeric, true, 2),
          (p_legoland_water, v_v_legoland_resort, o_legoland_counter, 'Legoland Waterpark Ticket', 55.00::numeric, true, 2),

          (p_hj_banana, v_v_hiap_joo, o_hiap_joo, 'Original Banana Cake', 15.00::numeric, false, 1),
          (p_hj_chocolate, v_v_hiap_joo, o_hiap_joo, 'Chocolate Marble Cake', 16.00::numeric, false, 1),

          (p_ciq_single, v_v_hotel_ciq, o_hotel_ciq, 'CIQ Budget Single', 65.00::numeric, true, 1),
          (p_ciq_twin, v_v_hotel_ciq, o_hotel_ciq, 'CIQ Budget Twin', 85.00::numeric, true, 1),
          (p_thistle_deluxe, v_v_thistle, o_thistle, 'Thistle Deluxe Room', 220.00::numeric, true, 1),
          (p_thistle_club, v_v_thistle, o_thistle, 'Thistle Club Room', 320.00::numeric, true, 1),
          (p_legoland_pirate, v_v_legoland_hotel, o_legoland_hotel, 'Legoland Pirate Room', 680.00::numeric, true, 1),
          (p_legoland_adventure, v_v_legoland_hotel, o_legoland_hotel, 'Legoland Adventure Room', 720.00::numeric, true, 1),
          (p_timotel_standard, v_v_timotel, o_timotel, 'Timotel Standard Room', 120.00::numeric, true, 1),
          (p_timotel_deluxe, v_v_timotel, o_timotel, 'Timotel Deluxe Room', 160.00::numeric, true, 1),
          (p_classic_standard, v_v_hotel_classic, o_hotel_classic, 'Hotel Classic Standard Room', 90.00::numeric, true, 1),
          (p_classic_family, v_v_hotel_classic, o_hotel_classic, 'Hotel Classic Family Room', 140.00::numeric, true, 1)
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
            UPDATE orders SET display_id = 'ORD-JH-SEED' WHERE id = v_order_id;
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
    SELECT vendor_id FROM outlets WHERE state = 'Johor');
  IF n <> 18 THEN RAISE EXCEPTION 'expected 18 Johor vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Johor';
  IF n <> 18 THEN RAISE EXCEPTION 'expected 18 Johor outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    WHERE p.vendor_id IN (SELECT vendor_id FROM outlets WHERE state = 'Johor')
       OR p.vendor_id IN (
         md5('johor:vendor:guide-nz-world-travels')::uuid,
         md5('johor:vendor:guide-sri-daya-travels')::uuid,
         md5('johor:vendor:guide-island-connection-travel-tours')::uuid
       );
  IF n <> 33 THEN RAISE EXCEPTION 'expected 33 Johor products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Johor'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Johor products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Johor';
  IF n <> 21 THEN RAISE EXCEPTION 'expected 21 Johor places (1 state + 7 regions + 13 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Johor';
  IF n <> 5 THEN RAISE EXCEPTION 'expected 5 Johor product_places links, found %', n; END IF;
END $$;

COMMIT;
