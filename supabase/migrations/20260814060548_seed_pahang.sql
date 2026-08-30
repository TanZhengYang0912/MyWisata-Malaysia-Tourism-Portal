BEGIN;

DO $$
DECLARE
  v_pahang uuid := md5('pahang:place:pahang')::uuid;
  v_cameron uuid := md5('pahang:place:cameron-highlands')::uuid;
  v_genting uuid := md5('pahang:place:genting-highlands')::uuid;
  v_frasers uuid := md5('pahang:place:frasers-hill')::uuid;
  v_kuantan uuid := md5('pahang:place:kuantan')::uuid;
  v_cherating uuid := md5('pahang:place:cherating')::uuid;
  v_taman_negara uuid := md5('pahang:place:taman-negara')::uuid;
  v_tioman uuid := md5('pahang:place:tioman-island')::uuid;
  v_lembing uuid := md5('pahang:place:sungai-lembing')::uuid;

  v_p_rafflesia uuid := md5('pahang:place:rafflesia-trail')::uuid;
  v_p_tea_estate uuid := md5('pahang:place:sungai-palas-tea-estate')::uuid;
  v_p_mossy uuid := md5('pahang:place:mossy-forest')::uuid;
  v_p_chin_swee uuid := md5('pahang:place:chin-swee-caves-temple')::uuid;
  v_p_skyway uuid := md5('pahang:place:genting-skyway')::uuid;
  v_p_frasers_clock uuid := md5('pahang:place:frasers-hill-clock-tower')::uuid;
  v_p_bishops uuid := md5('pahang:place:bishops-trail')::uuid;
  v_p_cempedak uuid := md5('pahang:place:teluk-cempedak-beach')::uuid;
  v_p_gua_charas uuid := md5('pahang:place:gua-charas')::uuid;
  v_p_pandan uuid := md5('pahang:place:sungai-pandan-waterfall')::uuid;
  v_p_cherating_beach uuid := md5('pahang:place:cherating-beach')::uuid;
  v_p_turtle uuid := md5('pahang:place:cherating-turtle-sanctuary')::uuid;
  v_p_canopy uuid := md5('pahang:place:canopy-walkway')::uuid;
  v_p_bukit_teresek uuid := md5('pahang:place:bukit-teresek')::uuid;
  v_p_lata_berkoh uuid := md5('pahang:place:lata-berkoh')::uuid;
  v_p_juara uuid := md5('pahang:place:juara-beach')::uuid;
  v_p_asah uuid := md5('pahang:place:asah-waterfall')::uuid;
  v_p_marine_park uuid := md5('pahang:place:tioman-marine-park')::uuid;
  v_p_rainbow uuid := md5('pahang:place:rainbow-waterfall')::uuid;
  v_p_tin_mine uuid := md5('pahang:place:tin-mine-museum')::uuid;

  v_v_ferm uuid := md5('pahang:vendor:food-restoran-ferm-nyonya')::uuid;
  v_v_barracks uuid := md5('pahang:vendor:food-barracks-cafe')::uuid;
  v_v_chow uuid := md5('pahang:vendor:food-uncle-chow-kopitiam')::uuid;
  v_v_kwan uuid := md5('pahang:vendor:food-kwan-kee')::uuid;
  v_v_kemaman uuid := md5('pahang:vendor:food-kemaman-kopitiam')::uuid;
  v_v_tc_curry uuid := md5('pahang:vendor:food-tc-curry-house')::uuid;
  v_v_hoi_yin uuid := md5('pahang:vendor:food-restoran-hoi-yin')::uuid;

  v_v_cs_travel uuid := md5('pahang:vendor:guide-cs-travel-and-tours')::uuid;
  v_v_hilltop uuid := md5('pahang:vendor:guide-hill-top-travel-tour')::uuid;
  v_v_mossy_cameron uuid := md5('pahang:vendor:guide-mossy-cameron')::uuid;
  v_v_jom_kembara uuid := md5('pahang:vendor:guide-jom-kembara-travel-tour')::uuid;

  v_v_cameron_forestry uuid := md5('pahang:vendor:op-cameron-highlands-forestry')::uuid;
  v_v_skyway_op uuid := md5('pahang:vendor:op-highlands-skyway-operations')::uuid;
  v_v_taman_negara_auth uuid := md5('pahang:vendor:op-taman-negara-park-authority')::uuid;
  v_v_marine_park_op uuid := md5('pahang:vendor:op-tioman-marine-park')::uuid;

  v_v_heritage_hotel uuid := md5('pahang:vendor:accom-heritage-hotel-cameron')::uuid;
  v_v_balas_chalet uuid := md5('pahang:vendor:accom-balas-chalet')::uuid;
  v_v_planters uuid := md5('pahang:vendor:accom-planters-hotel')::uuid;
  v_v_pine_beach uuid := md5('pahang:vendor:accom-pine-beach')::uuid;

  v_v_cameron_tea uuid := md5('pahang:vendor:retail-cameron-valley-tea-shop')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_ferm uuid := md5('pahang:outlet:ferm-nyonya-tanah-rata')::uuid;
  o_barracks uuid := md5('pahang:outlet:barracks-cafe-tanah-rata')::uuid;
  o_chow uuid := md5('pahang:outlet:uncle-chow-tanah-rata')::uuid;
  o_kwan uuid := md5('pahang:outlet:kwan-kee-brinchang')::uuid;
  o_kemaman uuid := md5('pahang:outlet:kemaman-kopitiam-kuantan')::uuid;
  o_tc_curry uuid := md5('pahang:outlet:tc-curry-house-cempedak')::uuid;
  o_hoi_yin uuid := md5('pahang:outlet:hoi-yin-cempedak')::uuid;

  o_cs_travel uuid := md5('pahang:outlet:guide-cs-travel')::uuid;
  o_hilltop uuid := md5('pahang:outlet:guide-hilltop-travel')::uuid;
  o_mossy_cameron uuid := md5('pahang:outlet:guide-mossy-cameron')::uuid;
  o_jom_kembara uuid := md5('pahang:outlet:guide-jom-kembara')::uuid;

  o_mossy_gate uuid := md5('pahang:outlet:op-mossy-forest-gate')::uuid;
  o_skyway_station uuid := md5('pahang:outlet:op-skyway-station')::uuid;
  o_taman_negara_counter uuid := md5('pahang:outlet:op-taman-negara-counter')::uuid;
  o_marine_park_centre uuid := md5('pahang:outlet:op-marine-park-centre')::uuid;

  o_heritage_hotel uuid := md5('pahang:outlet:accom-heritage-hotel-cameron')::uuid;
  o_balas_chalet uuid := md5('pahang:outlet:accom-balas-chalet')::uuid;
  o_planters uuid := md5('pahang:outlet:accom-planters-hotel')::uuid;
  o_pine_beach uuid := md5('pahang:outlet:accom-pine-beach')::uuid;

  o_cameron_tea uuid := md5('pahang:outlet:retail-cameron-tea-shop')::uuid;

  p_ferm_steamboat uuid := md5('pahang:product:ferm-nyonya-steamboat-set')::uuid;
  p_ferm_veg uuid := md5('pahang:product:ferm-cameron-highland-vegetables')::uuid;
  p_barracks_breakfast uuid := md5('pahang:product:barracks-english-breakfast')::uuid;
  p_barracks_tea uuid := md5('pahang:product:barracks-highland-tea-pot')::uuid;
  p_chow_breakfast uuid := md5('pahang:product:chow-kopitiam-breakfast-set')::uuid;
  p_chow_kaya uuid := md5('pahang:product:chow-kaya-toast')::uuid;
  p_kwan_steamboat uuid := md5('pahang:product:kwan-kee-steamboat-for-two')::uuid;
  p_kwan_rice uuid := md5('pahang:product:kwan-kee-fried-rice')::uuid;
  p_kemaman_set uuid := md5('pahang:product:kemaman-coffee-toast-set')::uuid;
  p_tc_curry uuid := md5('pahang:product:tc-banana-leaf-curry-set')::uuid;
  p_tc_roti uuid := md5('pahang:product:tc-roti-canai')::uuid;
  p_hoi_ikan uuid := md5('pahang:product:hoi-yin-grilled-ikan-bakar')::uuid;
  p_hoi_prawns uuid := md5('pahang:product:hoi-yin-butter-prawns')::uuid;

  p_rafflesia_trek uuid := md5('pahang:product:guide-rafflesia-trek')::uuid;
  p_rafflesia_combo uuid := md5('pahang:product:guide-rafflesia-mossy-combo')::uuid;
  p_mossy_walk uuid := md5('pahang:product:guide-mossy-forest-walk')::uuid;
  p_sunrise_rafflesia uuid := md5('pahang:product:guide-sunrise-rafflesia-trek')::uuid;
  p_bukit_teresek_climb uuid := md5('pahang:product:guide-bukit-teresek-climb')::uuid;
  p_lata_berkoh_trip uuid := md5('pahang:product:guide-lata-berkoh-rapids-trip')::uuid;

  p_mossy_entry uuid := md5('pahang:product:op-mossy-forest-entry')::uuid;
  p_skyway_ticket uuid := md5('pahang:product:op-skyway-cable-car-ticket')::uuid;
  p_skyway_glass uuid := md5('pahang:product:op-skyway-glass-cabin-upgrade')::uuid;
  p_canopy_ticket uuid := md5('pahang:product:op-canopy-walkway-ticket')::uuid;
  p_marine_pass uuid := md5('pahang:product:op-marine-park-conservation-pass')::uuid;

  p_heritage_twin uuid := md5('pahang:product:accom-heritage-twin-room')::uuid;
  p_heritage_family uuid := md5('pahang:product:accom-heritage-family-room')::uuid;
  p_tudor_chalet uuid := md5('pahang:product:accom-tudor-chalet-room')::uuid;
  p_planters_standard uuid := md5('pahang:product:accom-planters-standard-room')::uuid;
  p_pine_beach_room uuid := md5('pahang:product:accom-pine-beach-double-room')::uuid;

  p_tea_gift uuid := md5('pahang:product:retail-cameron-tea-gift-set')::uuid;
  p_strawberry uuid := md5('pahang:product:retail-strawberry-preserve-jar')::uuid;

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
    (v_v_ferm, v_owner_ali, 'Restoran Ferm Nyonya', 'restoran-ferm-nyonya',
     'Nyonya steamboat restaurant in Tanah Rata.', 'food', 'approved', now()),
    (v_v_barracks, v_owner_raj, 'Barracks Café', 'barracks-cafe',
     'Colonial-themed café on Jalan Gereja, Tanah Rata.', 'food', 'approved', now()),
    (v_v_chow, v_owner_siti, 'Uncle Chow Kopitiam', 'uncle-chow-kopitiam',
     'Traditional kopitiam breakfast spot in Tanah Rata.', 'food', 'approved', now()),
    (v_v_kwan, v_owner_ali, 'Kwan Kee', 'kwan-kee',
     'Steamboat restaurant in Brinchang.', 'food', 'approved', now()),
    (v_v_kemaman, v_owner_raj, 'Kemaman Kopitiam', 'kemaman-kopitiam',
     'Coffee and toast chain outlet in Kuantan.', 'food', 'approved', now()),
    (v_v_tc_curry, v_owner_siti, 'TC Curry House', 'tc-curry-house',
     'Banana leaf curry restaurant at Teluk Cempedak.', 'food', 'approved', now()),
    (v_v_hoi_yin, v_owner_ali, 'Restoran Hoi Yin', 'restoran-hoi-yin',
     'Seafood restaurant at Teluk Cempedak.', 'food', 'approved', now()),

    (v_v_cs_travel, v_owner_raj, 'C&S Travel and Tours', 'cs-travel-and-tours',
     'Licensed travel agency in Tanah Rata offering Cameron Highlands tours.', 'activity', 'approved', now()),
    (v_v_hilltop, v_owner_siti, 'Hill Top Travel & Tour', 'hill-top-travel-tour',
     'Licensed travel agency in Tanah Rata.', 'activity', 'approved', now()),
    (v_v_mossy_cameron, v_owner_ali, 'Mossy Cameron', 'mossy-cameron',
     'Licensed travel agency in Tanah Rata specialising in highland treks.', 'activity', 'approved', now()),
    (v_v_jom_kembara, v_owner_raj, 'Jom Kembara Travel & Tour', 'jom-kembara-travel-tour',
     'Licensed travel agency near the Taman Negara park headquarters at Kuala Tahan.', 'activity', 'approved', now()),

    (v_v_cameron_forestry, v_owner_siti, 'Cameron Highlands Forestry', 'cameron-highlands-forestry',
     'Operator of the Mossy Forest boardwalk in Brinchang.', 'attraction', 'approved', now()),
    (v_v_skyway_op, v_owner_ali, 'Highlands Skyway Operations', 'highlands-skyway-operations',
     'Operator of the Genting Skyway cable car.', 'attraction', 'approved', now()),
    (v_v_taman_negara_auth, v_owner_raj, 'Taman Negara Park Authority', 'taman-negara-park-authority',
     'Operator of the Taman Negara canopy walkway.', 'attraction', 'approved', now()),
    (v_v_marine_park_op, v_owner_siti, 'Tioman Marine Park', 'tioman-marine-park-vendor',
     'Operator of the Tioman Marine Park conservation area.', 'attraction', 'approved', now()),

    (v_v_heritage_hotel, v_owner_ali, 'Heritage Hotel Cameron Highlands', 'heritage-hotel-cameron-highlands',
     'Hotel in Tanah Rata.', 'accommodation', 'approved', now()),
    (v_v_balas_chalet, v_owner_raj, 'Bala''s Chalet', 'balas-chalet',
     'Heritage chalet accommodation in Tanah Rata.', 'accommodation', 'approved', now()),
    (v_v_planters, v_owner_siti, 'Planters Hotel', 'planters-hotel',
     'Hotel in Tanah Rata.', 'accommodation', 'approved', now()),
    (v_v_pine_beach, v_owner_ali, 'Pine Beach', 'pine-beach-hotel',
     'Beachfront hotel at Teluk Cempedak, Kuantan.', 'accommodation', 'approved', now()),

    (v_v_cameron_tea, v_owner_raj, 'Cameron Valley Tea Shop', 'cameron-valley-tea-shop',
     'Bharat Group tea shop in Tanah Rata.', 'retail', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_ferm, v_v_barracks, v_v_chow, v_v_kwan, v_v_kemaman, v_v_tc_curry, v_v_hoi_yin,
    v_v_cs_travel, v_v_hilltop, v_v_mossy_cameron, v_v_jom_kembara,
    v_v_cameron_forestry, v_v_skyway_op, v_v_taman_negara_auth, v_v_marine_park_op,
    v_v_heritage_hotel, v_v_balas_chalet, v_v_planters, v_v_pine_beach, v_v_cameron_tea
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_pahang, NULL, 'state', 'Pahang', 'pahang', 'Pahang', NULL, 3.8077, 103.3260, NULL, NULL,
     '/assets/customer/malaysia/pahang-cameron-highlands.webp'),

    (v_cameron, v_pahang, 'region', 'Cameron Highlands', 'cameron-highlands', 'Pahang', 'Cameron Highlands', 4.4700, 101.3800, NULL, NULL, NULL),
    (v_genting, v_pahang, 'region', 'Genting Highlands', 'genting-highlands', 'Pahang', 'Genting Highlands', 3.4230, 101.7930, NULL, NULL, NULL),
    (v_frasers, v_pahang, 'region', 'Fraser''s Hill', 'frasers-hill', 'Pahang', 'Fraser''s Hill', 3.7150, 101.7380, NULL, NULL, NULL),
    (v_kuantan, v_pahang, 'region', 'Kuantan', 'kuantan', 'Pahang', 'Kuantan', 3.8077, 103.3260, NULL, NULL, NULL),
    (v_cherating, v_pahang, 'region', 'Cherating', 'cherating', 'Pahang', 'Cherating', 4.1270, 103.3900, NULL, NULL, NULL),
    (v_taman_negara, v_pahang, 'region', 'Taman Negara', 'taman-negara', 'Pahang', 'Taman Negara', 4.3860, 102.4050, NULL, NULL, NULL),
    (v_tioman, v_pahang, 'region', 'Tioman Island', 'tioman-island', 'Pahang', 'Tioman Island', 2.8170, 104.1600, NULL, NULL, NULL),
    (v_lembing, v_pahang, 'region', 'Sungai Lembing', 'sungai-lembing', 'Pahang', 'Sungai Lembing', 3.9160, 103.0400, NULL, NULL, NULL),

    (v_p_rafflesia, v_cameron, 'poi', 'Gunung Brinchang Rafflesia Trail', 'rafflesia-trail', 'Pahang', 'Cameron Highlands', 4.5170, 101.3860, 0, NULL, NULL),
    (v_p_tea_estate, v_cameron, 'poi', 'Sungai Palas Tea Estate', 'sungai-palas-tea-estate', 'Pahang', 'Cameron Highlands', 4.5070, 101.3900, 0, NULL, NULL),
    (v_p_mossy, v_cameron, 'poi', 'Mossy Forest Boardwalk', 'mossy-forest', 'Pahang', 'Cameron Highlands', 4.5242283, 101.3818796, 10.00, v_v_cameron_forestry, NULL),
    (v_p_chin_swee, v_genting, 'poi', 'Chin Swee Caves Temple', 'chin-swee-caves-temple', 'Pahang', 'Genting Highlands', 3.3950, 101.7810, 0, NULL, NULL),
    (v_p_skyway, v_genting, 'poi', 'Genting Skyway Cable Car', 'genting-skyway', 'Pahang', 'Genting Highlands', 3.4227641, 101.7915994, 10.00, v_v_skyway_op, NULL),
    (v_p_frasers_clock, v_frasers, 'poi', 'Fraser''s Hill Clock Tower', 'frasers-hill-clock-tower', 'Pahang', 'Fraser''s Hill', 3.7150, 101.7380, 0, NULL, NULL),
    (v_p_bishops, v_frasers, 'poi', 'Bishop''s Trail', 'bishops-trail', 'Pahang', 'Fraser''s Hill', 3.7190, 101.7420, 0, NULL, NULL),
    (v_p_cempedak, v_kuantan, 'poi', 'Teluk Cempedak Beach', 'teluk-cempedak-beach', 'Pahang', 'Kuantan', 3.8140, 103.3720, 0, NULL, NULL),
    (v_p_gua_charas, v_kuantan, 'poi', 'Gua Charas Cave Temple', 'gua-charas', 'Pahang', 'Kuantan', 3.9330, 103.1500, 5.00, NULL, NULL),
    (v_p_pandan, v_kuantan, 'poi', 'Sungai Pandan Waterfall', 'sungai-pandan-waterfall', 'Pahang', 'Kuantan', 3.7280, 103.1420, 0, NULL, NULL),
    (v_p_cherating_beach, v_cherating, 'poi', 'Cherating Beach', 'cherating-beach', 'Pahang', 'Cherating', 4.1290, 103.3960, 0, NULL, NULL),
    (v_p_turtle, v_cherating, 'poi', 'Cherating Turtle Sanctuary', 'cherating-turtle-sanctuary', 'Pahang', 'Cherating', 4.1370, 103.4020, 0, NULL, NULL),
    (v_p_canopy, v_taman_negara, 'poi', 'Taman Negara Canopy Walkway', 'canopy-walkway', 'Pahang', 'Taman Negara', 4.3929719, 102.4102147, 5.00, v_v_taman_negara_auth, NULL),
    (v_p_bukit_teresek, v_taman_negara, 'poi', 'Bukit Teresek Trail', 'bukit-teresek', 'Pahang', 'Taman Negara', 4.3960, 102.4130, 0, NULL, NULL),
    (v_p_lata_berkoh, v_taman_negara, 'poi', 'Lata Berkoh Rapids', 'lata-berkoh', 'Pahang', 'Taman Negara', 4.4200, 102.4200, 0, NULL, NULL),
    (v_p_juara, v_tioman, 'poi', 'Juara Beach', 'juara-beach', 'Pahang', 'Tioman Island', 2.8100, 104.1930, 0, NULL, NULL),
    (v_p_asah, v_tioman, 'poi', 'Asah Waterfall', 'asah-waterfall', 'Pahang', 'Tioman Island', 2.7420, 104.1580, 0, NULL, NULL),
    (v_p_marine_park, v_tioman, 'poi', 'Tioman Marine Park Coral Reef', 'tioman-marine-park', 'Pahang', 'Tioman Island', 2.8341486, 104.1626434, 30.00, v_v_marine_park_op, NULL),
    (v_p_rainbow, v_lembing, 'poi', 'Rainbow Waterfall', 'rainbow-waterfall', 'Pahang', 'Sungai Lembing', 3.9560, 103.0200, 0, NULL, NULL),
    (v_p_tin_mine, v_lembing, 'poi', 'Sungai Lembing Tin Mine Museum', 'tin-mine-museum', 'Pahang', 'Sungai Lembing', 3.9180, 103.0410, 5.00, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_ferm, v_v_ferm, 'Restoran Ferm Nyonya', 'ferm-nyonya-tanah-rata', 'Persiaran Camellia 4', 'Tanah Rata', 'Pahang', 4.4698775, 101.3754825),
    (o_barracks, v_v_barracks, 'Barracks Café', 'barracks-cafe-tanah-rata', 'Jalan Gereja', 'Tanah Rata', 'Pahang', 4.4700365, 101.3741853),
    (o_chow, v_v_chow, 'Uncle Chow Kopitiam', 'uncle-chow-tanah-rata', NULL, 'Tanah Rata', 'Pahang', 4.4672272, 101.3723591),
    (o_kwan, v_v_kwan, 'Kwan Kee', 'kwan-kee-brinchang', NULL, 'Brinchang', 'Pahang', 4.4918609, 101.3885574),
    (o_kemaman, v_v_kemaman, 'Kemaman Kopitiam', 'kemaman-kopitiam-kuantan', NULL, 'Kuantan', 'Pahang', 3.8150626, 103.3281574),
    (o_tc_curry, v_v_tc_curry, 'TC Curry House', 'tc-curry-house-cempedak', 'Teluk Cempedak', 'Kuantan', 'Pahang', 3.8124682, 103.3701513),
    (o_hoi_yin, v_v_hoi_yin, 'Restoran Hoi Yin', 'hoi-yin-cempedak', 'Teluk Cempedak', 'Kuantan', 'Pahang', 3.8124910, 103.3699763),

    (o_cs_travel, v_v_cs_travel, 'C&S Travel and Tours', 'guide-cs-travel', NULL, 'Tanah Rata', 'Pahang', 4.4706790, 101.3759266),
    (o_hilltop, v_v_hilltop, 'Hill Top Travel & Tour', 'guide-hilltop-travel', NULL, 'Tanah Rata', 'Pahang', 4.4705976, 101.3776992),
    (o_mossy_cameron, v_v_mossy_cameron, 'Mossy Cameron', 'guide-mossy-cameron', NULL, 'Tanah Rata', 'Pahang', 4.4703213, 101.3770268),
    (o_jom_kembara, v_v_jom_kembara, 'Jom Kembara Travel & Tour', 'guide-jom-kembara', NULL, 'Kuala Tahan', 'Pahang', 4.3818598, 102.4021573),

    (o_mossy_gate, v_v_cameron_forestry, 'Cameron Highlands Forestry — Mossy Forest Gate', 'op-mossy-forest-gate', NULL, 'Brinchang', 'Pahang', 4.5242283, 101.3818796),
    (o_skyway_station, v_v_skyway_op, 'Highlands Skyway — Station', 'op-skyway-station', NULL, 'Genting Highlands', 'Pahang', 3.4227641, 101.7915994),
    (o_taman_negara_counter, v_v_taman_negara_auth, 'Taman Negara Park Authority — Counter', 'op-taman-negara-counter', NULL, 'Kuala Tahan', 'Pahang', 4.3865502, 102.4055631),
    (o_marine_park_centre, v_v_marine_park_op, 'Tioman Marine Park — Centre', 'op-marine-park-centre', NULL, 'Tioman Island', 'Pahang', 2.8341486, 104.1626434),

    (o_heritage_hotel, v_v_heritage_hotel, 'Heritage Hotel Cameron Highlands', 'accom-heritage-hotel-cameron', NULL, 'Tanah Rata', 'Pahang', 4.4712351, 101.3726280),
    (o_balas_chalet, v_v_balas_chalet, 'Bala''s Chalet', 'accom-balas-chalet', NULL, 'Tanah Rata', 'Pahang', 4.4776819, 101.3787437),
    (o_planters, v_v_planters, 'Planters Hotel', 'accom-planters-hotel', NULL, 'Tanah Rata', 'Pahang', 4.4706104, 101.3763131),
    (o_pine_beach, v_v_pine_beach, 'Pine Beach', 'accom-pine-beach', 'Teluk Cempedak', 'Kuantan', 'Pahang', 3.8124411, 103.3702961),

    (o_cameron_tea, v_v_cameron_tea, 'Cameron Valley Tea Shop', 'retail-cameron-tea-shop', NULL, 'Tanah Rata', 'Pahang', 4.4706986, 101.3781603)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_ferm_steamboat, v_v_ferm, o_ferm, c_food, 'Nyonya Steamboat Set', 'ferm-nyonya-steamboat-set', 'Nyonya-style steamboat for two.', 'food', false, 45.00),
    (p_ferm_veg, v_v_ferm, o_ferm, c_food, 'Cameron Highland Vegetables', 'ferm-cameron-highland-vegetables', 'Stir-fried highland vegetables.', 'food', false, 18.00),
    (p_barracks_breakfast, v_v_barracks, o_barracks, c_food, 'English Breakfast', 'barracks-english-breakfast', 'Full English breakfast set.', 'food', false, 26.00),
    (p_barracks_tea, v_v_barracks, o_barracks, c_food, 'Highland Tea Pot', 'barracks-highland-tea-pot', 'Pot of Cameron Highlands tea.', 'food', false, 12.00),
    (p_chow_breakfast, v_v_chow, o_chow, c_food, 'Kopitiam Breakfast Set', 'chow-kopitiam-breakfast-set', 'Soft-boiled eggs, toast and coffee.', 'food', false, 14.00),
    (p_chow_kaya, v_v_chow, o_chow, c_food, 'Kaya Toast', 'chow-kaya-toast', 'Charcoal-toasted bread with kaya and butter.', 'food', false, 7.00),
    (p_kwan_steamboat, v_v_kwan, o_kwan, c_food, 'Steamboat for Two', 'kwan-kee-steamboat-for-two', 'Brinchang-style steamboat for two.', 'food', false, 55.00),
    (p_kwan_rice, v_v_kwan, o_kwan, c_food, 'Fried Rice', 'kwan-kee-fried-rice', 'Wok-fried rice.', 'food', false, 14.00),
    (p_kemaman_set, v_v_kemaman, o_kemaman, c_food, 'Kemaman Coffee & Toast Set', 'kemaman-coffee-toast-set', 'Kemaman-style coffee and toast set.', 'food', false, 13.00),
    (p_tc_curry, v_v_tc_curry, o_tc_curry, c_food, 'Banana Leaf Curry Set', 'tc-banana-leaf-curry-set', 'Banana leaf curry set at Teluk Cempedak.', 'food', false, 16.00),
    (p_tc_roti, v_v_tc_curry, o_tc_curry, c_food, 'Roti Canai', 'tc-roti-canai', 'Griddled roti canai with dhal.', 'food', false, 4.00),
    (p_hoi_ikan, v_v_hoi_yin, o_hoi_yin, c_food, 'Grilled Ikan Bakar', 'hoi-yin-grilled-ikan-bakar', 'Charcoal-grilled fish with sambal.', 'food', false, 32.00),
    (p_hoi_prawns, v_v_hoi_yin, o_hoi_yin, c_food, 'Butter Prawns', 'hoi-yin-butter-prawns', 'Butter-fried prawns.', 'food', false, 38.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_rafflesia_trek, v_v_cs_travel, NULL, c_activity, 'Rafflesia Trek', 'guide-rafflesia-trek', 'Guided trek to see the Rafflesia bloom, when in season.', 'experience', true, 120.00),
    (p_rafflesia_combo, v_v_hilltop, NULL, c_activity, 'Rafflesia & Mossy Forest Combo', 'guide-rafflesia-mossy-combo', 'Combined Rafflesia trail and Mossy Forest guided tour.', 'experience', true, 180.00),
    (p_mossy_walk, v_v_hilltop, NULL, c_activity, 'Mossy Forest Guided Walk', 'guide-mossy-forest-walk', 'Guided walk through the Mossy Forest boardwalk.', 'experience', true, 95.00),
    (p_sunrise_rafflesia, v_v_mossy_cameron, NULL, c_activity, 'Sunrise Rafflesia Trek', 'guide-sunrise-rafflesia-trek', 'Early-morning guided trek to the Rafflesia trail.', 'experience', true, 150.00),
    (p_bukit_teresek_climb, v_v_jom_kembara, NULL, c_activity, 'Bukit Teresek Guided Climb', 'guide-bukit-teresek-climb', 'Guided climb of the Bukit Teresek trail.', 'experience', true, 85.00),
    (p_lata_berkoh_trip, v_v_jom_kembara, NULL, c_activity, 'Lata Berkoh Rapids Trip', 'guide-lata-berkoh-rapids-trip', 'Guided trip to the Lata Berkoh rapids.', 'experience', true, 140.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_mossy_entry, v_v_cameron_forestry, o_mossy_gate, c_activity, 'Mossy Forest Boardwalk Entry', 'op-mossy-forest-entry', 'Entry to the Mossy Forest boardwalk.', 'activity', true, 10.00),
    (p_skyway_ticket, v_v_skyway_op, o_skyway_station, c_activity, 'Skyway Cable Car Ticket', 'op-skyway-cable-car-ticket', 'Cable car ticket on the Genting Skyway.', 'activity', true, 10.00),
    (p_skyway_glass, v_v_skyway_op, o_skyway_station, c_activity, 'Skyway Glass Cabin Upgrade', 'op-skyway-glass-cabin-upgrade', 'Upgrade to a glass-floor cabin.', 'activity', true, 25.00),
    (p_canopy_ticket, v_v_taman_negara_auth, o_taman_negara_counter, c_activity, 'Canopy Walkway Ticket', 'op-canopy-walkway-ticket', 'Entry to the Taman Negara canopy walkway.', 'activity', true, 5.00),
    (p_marine_pass, v_v_marine_park_op, o_marine_park_centre, c_activity, 'Marine Park Conservation Pass', 'op-marine-park-conservation-pass', 'Conservation pass for the Tioman Marine Park.', 'activity', true, 30.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_heritage_twin, v_v_heritage_hotel, o_heritage_hotel, c_accommodation, 'Heritage Twin Room', 'accom-heritage-twin-room', 'Twin room at the Heritage Hotel.', 'service', true, 240.00),
    (p_heritage_family, v_v_heritage_hotel, o_heritage_hotel, c_accommodation, 'Heritage Family Room', 'accom-heritage-family-room', 'Family room at the Heritage Hotel.', 'service', true, 360.00),
    (p_tudor_chalet, v_v_balas_chalet, o_balas_chalet, c_accommodation, 'Tudor Chalet Room', 'accom-tudor-chalet-room', 'Tudor-style chalet room.', 'service', true, 190.00),
    (p_planters_standard, v_v_planters, o_planters, c_accommodation, 'Planters Standard Room', 'accom-planters-standard-room', 'Standard room at the Planters Hotel.', 'service', true, 150.00),
    (p_pine_beach_room, v_v_pine_beach, o_pine_beach, c_accommodation, 'Beachfront Double Room', 'accom-pine-beach-double-room', 'Double room facing Teluk Cempedak beach.', 'service', true, 160.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_tea_gift, v_v_cameron_tea, o_cameron_tea, c_retail, 'Cameron Highlands Tea Gift Set', 'retail-cameron-tea-gift-set', 'Boxed set of Cameron Highlands tea.', 'product', false, 55.00),
    (p_strawberry, v_v_cameron_tea, o_cameron_tea, c_retail, 'Strawberry Preserve Jar', 'retail-strawberry-preserve-jar', 'Jar of Cameron Highlands strawberry preserve.', 'product', false, 22.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('pahang:variant:heritage-twin-room-only')::uuid, p_heritage_twin, 'Room Only', 0, true),
    (md5('pahang:variant:heritage-twin-breakfast')::uuid, p_heritage_twin, 'Breakfast Included', 40, false),
    (md5('pahang:variant:heritage-family-room-only')::uuid, p_heritage_family, 'Room Only', 0, true),
    (md5('pahang:variant:tudor-chalet-room-only')::uuid, p_tudor_chalet, 'Room Only', 0, true),
    (md5('pahang:variant:tudor-chalet-breakfast')::uuid, p_tudor_chalet, 'Breakfast Included', 35, false),
    (md5('pahang:variant:planters-standard')::uuid, p_planters_standard, 'Standard', 0, true),
    (md5('pahang:variant:pine-beach-room-only')::uuid, p_pine_beach_room, 'Room Only', 0, true),
    (md5('pahang:variant:tea-gift-black')::uuid, p_tea_gift, 'Black Tea', 0, true),
    (md5('pahang:variant:tea-gift-green')::uuid, p_tea_gift, 'Green Tea', 0, false),
    (md5('pahang:variant:strawberry-standard')::uuid, p_strawberry, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_tea_gift, p_strawberry)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_rafflesia_trek, v_p_rafflesia, 'guide_service'),
    (p_rafflesia_combo, v_p_rafflesia, 'guide_service'),
    (p_sunrise_rafflesia, v_p_rafflesia, 'guide_service'),
    (p_mossy_entry, v_p_mossy, 'admission'),
    (p_mossy_walk, v_p_mossy, 'guide_service'),
    (p_skyway_ticket, v_p_skyway, 'admission'),
    (p_skyway_glass, v_p_skyway, 'addon'),
    (p_canopy_ticket, v_p_canopy, 'admission'),
    (p_bukit_teresek_climb, v_p_bukit_teresek, 'guide_service'),
    (p_lata_berkoh_trip, v_p_lata_berkoh, 'guide_service'),
    (p_marine_pass, v_p_marine_park, 'admission')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-PH-SEED') THEN

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
          (p_ferm_steamboat, v_v_ferm, o_ferm, 'Nyonya Steamboat Set', 45.00::numeric, false, 2),
          (p_ferm_veg, v_v_ferm, o_ferm, 'Cameron Highland Vegetables', 18.00::numeric, false, 2),
          (p_barracks_breakfast, v_v_barracks, o_barracks, 'English Breakfast', 26.00::numeric, false, 2),
          (p_barracks_tea, v_v_barracks, o_barracks, 'Highland Tea Pot', 12.00::numeric, false, 2),
          (p_chow_breakfast, v_v_chow, o_chow, 'Kopitiam Breakfast Set', 14.00::numeric, false, 2),
          (p_chow_kaya, v_v_chow, o_chow, 'Kaya Toast', 7.00::numeric, false, 2),
          (p_kwan_steamboat, v_v_kwan, o_kwan, 'Steamboat for Two', 55.00::numeric, false, 2),
          (p_kwan_rice, v_v_kwan, o_kwan, 'Fried Rice', 14.00::numeric, false, 2),
          (p_kemaman_set, v_v_kemaman, o_kemaman, 'Kemaman Coffee & Toast Set', 13.00::numeric, false, 2),
          (p_tc_curry, v_v_tc_curry, o_tc_curry, 'Banana Leaf Curry Set', 16.00::numeric, false, 2),
          (p_tc_roti, v_v_tc_curry, o_tc_curry, 'Roti Canai', 4.00::numeric, false, 2),
          (p_hoi_ikan, v_v_hoi_yin, o_hoi_yin, 'Grilled Ikan Bakar', 32.00::numeric, false, 2),
          (p_hoi_prawns, v_v_hoi_yin, o_hoi_yin, 'Butter Prawns', 38.00::numeric, false, 2),

          (p_mossy_entry, v_v_cameron_forestry, o_mossy_gate, 'Mossy Forest Boardwalk Entry', 10.00::numeric, true, 2),
          (p_skyway_ticket, v_v_skyway_op, o_skyway_station, 'Skyway Cable Car Ticket', 10.00::numeric, true, 2),
          (p_skyway_glass, v_v_skyway_op, o_skyway_station, 'Skyway Glass Cabin Upgrade', 25.00::numeric, true, 2),
          (p_canopy_ticket, v_v_taman_negara_auth, o_taman_negara_counter, 'Canopy Walkway Ticket', 5.00::numeric, true, 2),
          (p_marine_pass, v_v_marine_park_op, o_marine_park_centre, 'Marine Park Conservation Pass', 30.00::numeric, true, 2),

          (p_heritage_twin, v_v_heritage_hotel, o_heritage_hotel, 'Heritage Twin Room', 240.00::numeric, true, 1),
          (p_heritage_family, v_v_heritage_hotel, o_heritage_hotel, 'Heritage Family Room', 360.00::numeric, true, 1),
          (p_tudor_chalet, v_v_balas_chalet, o_balas_chalet, 'Tudor Chalet Room', 190.00::numeric, true, 1),
          (p_planters_standard, v_v_planters, o_planters, 'Planters Standard Room', 150.00::numeric, true, 1),
          (p_pine_beach_room, v_v_pine_beach, o_pine_beach, 'Beachfront Double Room', 160.00::numeric, true, 1),

          (p_tea_gift, v_v_cameron_tea, o_cameron_tea, 'Cameron Highlands Tea Gift Set', 55.00::numeric, false, 1),
          (p_strawberry, v_v_cameron_tea, o_cameron_tea, 'Strawberry Preserve Jar', 22.00::numeric, false, 1)
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
            UPDATE orders SET display_id = 'ORD-PH-SEED' WHERE id = v_order_id;
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

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM vendors WHERE id IN (
    SELECT vendor_id FROM outlets WHERE state = 'Pahang');
  IF n <> 20 THEN RAISE EXCEPTION 'expected 20 Pahang vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Pahang';
  IF n <> 20 THEN RAISE EXCEPTION 'expected 20 Pahang outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE v.id IN (SELECT vendor_id FROM outlets WHERE state = 'Pahang')
       OR v.id IN (md5('pahang:vendor:guide-cs-travel-and-tours')::uuid,
                   md5('pahang:vendor:guide-hill-top-travel-tour')::uuid,
                   md5('pahang:vendor:guide-mossy-cameron')::uuid,
                   md5('pahang:vendor:guide-jom-kembara-travel-tour')::uuid);
  IF n <> 31 THEN RAISE EXCEPTION 'expected 31 Pahang products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Pahang'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Pahang products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Pahang';
  IF n <> 29 THEN RAISE EXCEPTION 'expected 29 Pahang places (1 state + 8 regions + 20 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Pahang';
  IF n <> 11 THEN RAISE EXCEPTION 'expected 11 Pahang product_places links, found %', n; END IF;
END $$;

COMMIT;
;
