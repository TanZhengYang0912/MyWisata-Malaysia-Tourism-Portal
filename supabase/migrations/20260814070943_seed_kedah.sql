-- Kedah place model — seed data.
-- See docs/plans/2026-08-14-1520-kedah-real-business-seed.md
--
-- BUSINESS IDENTITIES ARE REAL. COMMERCIAL DATA IS NOT.
--
-- Vendor names, outlet names, addresses and coordinates are real Kedah
-- (Langkawi + Alor Setar) businesses sourced from OpenStreetMap —
-- © OpenStreetMap contributors, ODbL v1.0.
--
-- ALL COMMERCIAL DATA IS FABRICATED. The orders, reviews, ratings, revenue
-- and wallet balances in section 9 are randomly generated demo content for
-- an academic project. They do not describe the real businesses named here.
--
-- NO EXCEPTIONS: every vendor, outlet, name, address and coordinate below
-- is real. The guide-service products belong to 2 real Pantai Cenang travel
-- agencies (shop=travel_agency); their itineraries and prices are plausible
-- demo content, not those agencies' actual catalogues.
--
-- category_id resolved once via c_food/c_activity/c_accommodation/c_retail.

BEGIN;

DO $$
DECLARE
  v_kedah uuid := md5('kedah:place:kedah')::uuid;
  v_pantai_cenang uuid := md5('kedah:place:pantai-cenang')::uuid;
  v_kuah uuid := md5('kedah:place:kuah')::uuid;
  v_kilim uuid := md5('kedah:place:kilim')::uuid;
  v_oriental_village uuid := md5('kedah:place:oriental-village')::uuid;
  v_tanjung_rhu uuid := md5('kedah:place:tanjung-rhu')::uuid;
  v_alor_setar uuid := md5('kedah:place:alor-setar')::uuid;

  v_p_skycab uuid := md5('kedah:place:langkawi-skycab')::uuid;
  v_p_underwater uuid := md5('kedah:place:underwater-world')::uuid;
  v_p_eagle_square uuid := md5('kedah:place:eagle-square')::uuid;
  v_p_jetty_point uuid := md5('kedah:place:jetty-point-kuah')::uuid;
  v_p_kilim_park uuid := md5('kedah:place:kilim-geoforest-park')::uuid;
  v_p_gunung_raya uuid := md5('kedah:place:gunung-raya')::uuid;
  v_p_tanjung_rhu_beach uuid := md5('kedah:place:pantai-tanjung-rhu')::uuid;
  v_p_cenang_beach uuid := md5('kedah:place:pantai-cenang-beach')::uuid;
  v_p_zahir uuid := md5('kedah:place:masjid-zahir')::uuid;
  v_p_menara uuid := md5('kedah:place:menara-alor-setar')::uuid;

  v_v_mans_cafe uuid := md5('kedah:vendor:food-mans-cafe')::uuid;
  v_v_cliff uuid := md5('kedah:vendor:food-the-cliff-restaurant')::uuid;
  v_v_yasmin uuid := md5('kedah:vendor:food-yasmin-syrian')::uuid;
  v_v_lyy_seafood uuid := md5('kedah:vendor:food-langkawi-yummy-yummy-seafood')::uuid;
  v_v_chia_bee uuid := md5('kedah:vendor:food-chia-bee-bah-kut-teh')::uuid;
  v_v_nk_yasmeen uuid := md5('kedah:vendor:food-restoran-nasi-kandar-yasmeen')::uuid;

  v_v_paradise_craft uuid := md5('kedah:vendor:retail-paradise-craft')::uuid;
  v_v_loyal_maxim uuid := md5('kedah:vendor:retail-loyal-maxim-duty-free')::uuid;

  v_v_love_island uuid := md5('kedah:vendor:guide-love-island-tours')::uuid;
  v_v_avante uuid := md5('kedah:vendor:guide-avante-holidays')::uuid;

  v_v_cable_car uuid := md5('kedah:vendor:op-langkawi-cable-car')::uuid;
  v_v_underwater_op uuid := md5('kedah:vendor:op-underwater-world-langkawi')::uuid;
  v_v_menara_op uuid := md5('kedah:vendor:op-menara-alor-setar')::uuid;

  v_v_sandy_beach uuid := md5('kedah:vendor:accom-sandy-beach-resort')::uuid;
  v_v_casa_del_mar uuid := md5('kedah:vendor:accom-casa-del-mar')::uuid;
  v_v_pelangi uuid := md5('kedah:vendor:accom-pelangi-beach-resort')::uuid;
  v_v_langkasuka uuid := md5('kedah:vendor:accom-hotel-langkasuka')::uuid;
  v_v_samila uuid := md5('kedah:vendor:accom-samila-hotel')::uuid;

  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  o_mans_cafe uuid := md5('kedah:outlet:mans-cafe')::uuid;
  o_cliff uuid := md5('kedah:outlet:the-cliff-restaurant')::uuid;
  o_yasmin uuid := md5('kedah:outlet:yasmin-syrian')::uuid;
  o_lyy_seafood uuid := md5('kedah:outlet:langkawi-yummy-yummy-seafood')::uuid;
  o_chia_bee uuid := md5('kedah:outlet:chia-bee-bah-kut-teh')::uuid;
  o_nk_yasmeen uuid := md5('kedah:outlet:restoran-nasi-kandar-yasmeen')::uuid;

  o_paradise_craft uuid := md5('kedah:outlet:paradise-craft')::uuid;
  o_loyal_maxim uuid := md5('kedah:outlet:loyal-maxim-duty-free')::uuid;

  o_love_island uuid := md5('kedah:outlet:love-island-tours')::uuid;
  o_avante uuid := md5('kedah:outlet:avante-holidays')::uuid;

  o_cable_car uuid := md5('kedah:outlet:langkawi-cable-car')::uuid;
  o_underwater uuid := md5('kedah:outlet:underwater-world-langkawi')::uuid;
  o_menara uuid := md5('kedah:outlet:menara-alor-setar')::uuid;

  o_sandy_beach uuid := md5('kedah:outlet:sandy-beach-resort')::uuid;
  o_casa_del_mar uuid := md5('kedah:outlet:casa-del-mar')::uuid;
  o_pelangi uuid := md5('kedah:outlet:pelangi-beach-resort')::uuid;
  o_langkasuka uuid := md5('kedah:outlet:hotel-langkasuka')::uuid;
  o_samila uuid := md5('kedah:outlet:samila-hotel')::uuid;

  p_mans_breakfast uuid := md5('kedah:product:mans-cafe-breakfast')::uuid;
  p_mans_smoothie uuid := md5('kedah:product:mans-cafe-smoothie-bowl')::uuid;
  p_cliff_seafood uuid := md5('kedah:product:cliff-grilled-seafood-platter')::uuid;
  p_cliff_sunset uuid := md5('kedah:product:cliff-sunset-cocktail')::uuid;
  p_yasmin_mezze uuid := md5('kedah:product:yasmin-mezze-platter')::uuid;
  p_yasmin_shawarma uuid := md5('kedah:product:yasmin-chicken-shawarma')::uuid;
  p_lyy_crab uuid := md5('kedah:product:lyy-butter-crab')::uuid;
  p_lyy_fish uuid := md5('kedah:product:lyy-steamed-seabass')::uuid;
  p_chiabee_soup uuid := md5('kedah:product:chiabee-bah-kut-teh-set')::uuid;
  p_chiabee_rice uuid := md5('kedah:product:chiabee-claypot-rice')::uuid;
  p_nky_ayam uuid := md5('kedah:product:nky-nasi-kandar-ayam')::uuid;
  p_nky_roti uuid := md5('kedah:product:nky-roti-canai')::uuid;

  p_pc_batik uuid := md5('kedah:product:paradise-craft-batik-sarong')::uuid;
  p_lm_chocolate uuid := md5('kedah:product:loyal-maxim-chocolate-box')::uuid;

  p_guide_kilim_love uuid := md5('kedah:product:guide-kilim-mangrove-tour')::uuid;
  p_guide_kilim_avante uuid := md5('kedah:product:guide-kilim-mangrove-eagle-tour')::uuid;
  p_guide_gunung_raya uuid := md5('kedah:product:guide-gunung-raya-trek')::uuid;

  p_skycab_ticket uuid := md5('kedah:product:skycab-return-ticket')::uuid;
  p_underwater_ticket uuid := md5('kedah:product:underwater-world-entry')::uuid;
  p_menara_ticket uuid := md5('kedah:product:menara-alor-setar-ticket')::uuid;

  p_sandy_standard uuid := md5('kedah:product:sandy-beach-standard-room')::uuid;
  p_sandy_deluxe uuid := md5('kedah:product:sandy-beach-deluxe-room')::uuid;
  p_casa_room uuid := md5('kedah:product:casa-del-mar-room')::uuid;
  p_casa_suite uuid := md5('kedah:product:casa-del-mar-suite')::uuid;
  p_pelangi_garden uuid := md5('kedah:product:pelangi-garden-room')::uuid;
  p_pelangi_beachfront uuid := md5('kedah:product:pelangi-beachfront-room')::uuid;
  p_langkasuka_standard uuid := md5('kedah:product:langkasuka-standard-room')::uuid;
  p_langkasuka_deluxe uuid := md5('kedah:product:langkasuka-deluxe-room')::uuid;
  p_samila_standard uuid := md5('kedah:product:samila-standard-room')::uuid;
  p_samila_family uuid := md5('kedah:product:samila-family-room')::uuid;

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
    (v_v_mans_cafe, v_owner_ali, 'Man''s Cafe', 'mans-cafe',
     'Café on the Pantai Cenang beach strip.', 'food', 'approved', now()),
    (v_v_cliff, v_owner_raj, 'The Cliff Restaurant & Bar', 'the-cliff-restaurant',
     'Clifftop restaurant and bar in Pantai Cenang.', 'food', 'approved', now()),
    (v_v_yasmin, v_owner_siti, 'Yasmin Syrian', 'yasmin-syrian',
     'Syrian restaurant in Pantai Cenang.', 'food', 'approved', now()),
    (v_v_lyy_seafood, v_owner_ali, 'Langkawi Yummy Yummy Seafood', 'langkawi-yummy-yummy-seafood',
     'Seafood restaurant in Kuah town.', 'food', 'approved', now()),
    (v_v_chia_bee, v_owner_raj, 'Chia Bee Bah Kut Teh', 'chia-bee-bah-kut-teh',
     'Long-running bah kut teh restaurant in Alor Setar.', 'food', 'approved', now()),
    (v_v_nk_yasmeen, v_owner_siti, 'Restoran Nasi Kandar Yasmeen', 'restoran-nasi-kandar-yasmeen',
     'Nasi kandar restaurant in Alor Setar.', 'food', 'approved', now()),

    (v_v_paradise_craft, v_owner_ali, 'Paradise Craft', 'paradise-craft',
     'Handicraft and souvenir shop in Pantai Cenang.', 'retail', 'approved', now()),
    (v_v_loyal_maxim, v_owner_raj, 'Loyal Maxim Duty Free', 'loyal-maxim-duty-free',
     'Duty-free shop in Pantai Cenang.', 'retail', 'approved', now()),

    (v_v_love_island, v_owner_siti, 'Love Island Tours', 'love-island-tours',
     'Licensed travel agency in Pantai Cenang.', 'activity', 'approved', now()),
    (v_v_avante, v_owner_ali, 'Avante Holidays', 'avante-holidays',
     'Licensed travel agency in Pantai Cenang.', 'activity', 'approved', now()),

    (v_v_cable_car, v_owner_raj, 'Langkawi Cable Car Sdn Bhd', 'langkawi-cable-car',
     'Operator of the Langkawi SkyCab.', 'attraction', 'approved', now()),
    (v_v_underwater_op, v_owner_siti, 'Underwater World Langkawi', 'underwater-world-langkawi',
     'Operator of the Underwater World Langkawi aquarium.', 'attraction', 'approved', now()),
    (v_v_menara_op, v_owner_ali, 'Menara Alor Setar Management', 'menara-alor-setar-management',
     'Operator of the Menara Alor Setar tower.', 'attraction', 'approved', now()),

    (v_v_sandy_beach, v_owner_raj, 'Sandy Beach Resort', 'sandy-beach-resort',
     'Beach resort in Pantai Cenang.', 'accommodation', 'approved', now()),
    (v_v_casa_del_mar, v_owner_siti, 'Casa del Mar', 'casa-del-mar',
     'Beach hotel in Pantai Cenang.', 'accommodation', 'approved', now()),
    (v_v_pelangi, v_owner_ali, 'Pelangi Beach Resort & Spa', 'pelangi-beach-resort-spa',
     'Beach resort in Pantai Cenang.', 'accommodation', 'approved', now()),
    (v_v_langkasuka, v_owner_raj, 'Hotel Langkasuka', 'hotel-langkasuka',
     'Hotel in Kuah town.', 'accommodation', 'approved', now()),
    (v_v_samila, v_owner_siti, 'Samila Hotel', 'samila-hotel',
     'Hotel in Alor Setar.', 'accommodation', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  WHERE v.id IN (
    v_v_mans_cafe, v_v_cliff, v_v_yasmin, v_v_lyy_seafood, v_v_chia_bee, v_v_nk_yasmeen,
    v_v_paradise_craft, v_v_loyal_maxim, v_v_love_island, v_v_avante,
    v_v_cable_car, v_v_underwater_op, v_v_menara_op,
    v_v_sandy_beach, v_v_casa_del_mar, v_v_pelangi, v_v_langkasuka, v_v_samila
  )
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
  VALUES
    (v_kedah, NULL, 'state', 'Kedah', 'kedah', 'Kedah', NULL, 6.1200, 100.3670, NULL, NULL, NULL),

    (v_pantai_cenang, v_kedah, 'region', 'Pantai Cenang', 'pantai-cenang', 'Kedah', 'Pantai Cenang', 6.2900, 99.7270, NULL, NULL, NULL),
    (v_kuah, v_kedah, 'region', 'Kuah', 'kuah', 'Kedah', 'Kuah', 6.3250, 99.8400, NULL, NULL, NULL),
    (v_kilim, v_kedah, 'region', 'Kilim', 'kilim', 'Kedah', 'Kilim', 6.4100, 99.8500, NULL, NULL, NULL),
    (v_oriental_village, v_kedah, 'region', 'Oriental Village', 'oriental-village', 'Kedah', 'Oriental Village', 6.3800, 99.6650, NULL, NULL, NULL),
    (v_tanjung_rhu, v_kedah, 'region', 'Tanjung Rhu', 'tanjung-rhu', 'Kedah', 'Tanjung Rhu', 6.4550, 99.8230, NULL, NULL, NULL),
    (v_alor_setar, v_kedah, 'region', 'Alor Setar', 'alor-setar', 'Kedah', 'Alor Setar', 6.1200, 100.3670, NULL, NULL, NULL),

    (v_p_skycab, v_oriental_village, 'poi', 'Langkawi SkyCab', 'langkawi-skycab', 'Kedah', 'Oriental Village', 6.371249, 99.671584, 55.00, v_v_cable_car, NULL),
    (v_p_underwater, v_pantai_cenang, 'poi', 'Underwater World Langkawi', 'underwater-world', 'Kedah', 'Pantai Cenang', 6.287832, 99.728615, 48.00, v_v_underwater_op, NULL),
    (v_p_eagle_square, v_kuah, 'poi', 'Eagle Square', 'eagle-square', 'Kedah', 'Kuah', 6.308423, 99.851935, 0, NULL, NULL),
    (v_p_jetty_point, v_kuah, 'poi', 'Jetty Point', 'jetty-point-kuah', 'Kedah', 'Kuah', 6.306152, 99.852021, 0, NULL, NULL),
    (v_p_kilim_park, v_kilim, 'poi', 'Kilim Geoforest Park', 'kilim-geoforest-park', 'Kedah', 'Kilim', 6.405027, 99.858209, 0, NULL, NULL),
    (v_p_gunung_raya, v_oriental_village, 'poi', 'Gunung Raya', 'gunung-raya', 'Kedah', 'Oriental Village', 6.364020, 99.791565, 0, NULL, NULL),
    (v_p_tanjung_rhu_beach, v_tanjung_rhu, 'poi', 'Pantai Tanjung Rhu', 'pantai-tanjung-rhu', 'Kedah', 'Tanjung Rhu', 6.457845, 99.824899, 0, NULL, NULL),
    (v_p_cenang_beach, v_pantai_cenang, 'poi', 'Pantai Cenang Beach', 'pantai-cenang-beach', 'Kedah', 'Pantai Cenang', 6.290000, 99.727000, 0, NULL, NULL),
    (v_p_zahir, v_alor_setar, 'poi', 'Masjid Zahir', 'masjid-zahir', 'Kedah', 'Alor Setar', 6.120258, 100.365102, 0, NULL, NULL),
    (v_p_menara, v_alor_setar, 'poi', 'Menara Alor Setar', 'menara-alor-setar', 'Kedah', 'Alor Setar', 6.124513, 100.367538, 15.00, v_v_menara_op, NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_mans_cafe, v_v_mans_cafe, 'Man''s Cafe', 'mans-cafe', NULL, 'Pantai Cenang', 'Kedah', 6.291647, 99.726888),
    (o_cliff, v_v_cliff, 'The Cliff Restaurant & Bar', 'the-cliff-restaurant', NULL, 'Pantai Cenang', 'Kedah', 6.287239, 99.727441),
    (o_yasmin, v_v_yasmin, 'Yasmin Syrian', 'yasmin-syrian', NULL, 'Pantai Cenang', 'Kedah', 6.295938, 99.723756),
    (o_lyy_seafood, v_v_lyy_seafood, 'Langkawi Yummy Yummy Seafood', 'langkawi-yummy-yummy-seafood', NULL, 'Kuah', 'Kedah', 6.325723, 99.841819),
    (o_chia_bee, v_v_chia_bee, 'Chia Bee Bah Kut Teh', 'chia-bee-bah-kut-teh', NULL, 'Alor Setar', 'Kedah', 6.123497, 100.362140),
    (o_nk_yasmeen, v_v_nk_yasmeen, 'Restoran Nasi Kandar Yasmeen', 'restoran-nasi-kandar-yasmeen', NULL, 'Alor Setar', 'Kedah', 6.139191, 100.369998),

    (o_paradise_craft, v_v_paradise_craft, 'Paradise Craft', 'paradise-craft', NULL, 'Pantai Cenang', 'Kedah', 6.293734, 99.725097),
    (o_loyal_maxim, v_v_loyal_maxim, 'Loyal Maxim Duty Free', 'loyal-maxim-duty-free', NULL, 'Pantai Cenang', 'Kedah', 6.286215, 99.730342),

    (o_love_island, v_v_love_island, 'Love Island Tours', 'love-island-tours', NULL, 'Pantai Cenang', 'Kedah', 6.290793, 99.727816),
    (o_avante, v_v_avante, 'Avante Holidays', 'avante-holidays', NULL, 'Pantai Cenang', 'Kedah', 6.290534, 99.727398),

    (o_cable_car, v_v_cable_car, 'Langkawi Cable Car — Base Station', 'langkawi-cable-car', NULL, 'Oriental Village', 'Kedah', 6.371249, 99.671584),
    (o_underwater, v_v_underwater_op, 'Underwater World Langkawi', 'underwater-world-langkawi', NULL, 'Pantai Cenang', 'Kedah', 6.287832, 99.728615),
    (o_menara, v_v_menara_op, 'Menara Alor Setar', 'menara-alor-setar', NULL, 'Alor Setar', 'Kedah', 6.124513, 100.367538),

    (o_sandy_beach, v_v_sandy_beach, 'Sandy Beach Resort', 'sandy-beach-resort', NULL, 'Pantai Cenang', 'Kedah', 6.292506, 99.725551),
    (o_casa_del_mar, v_v_casa_del_mar, 'Casa del Mar', 'casa-del-mar', NULL, 'Pantai Cenang', 'Kedah', 6.296678, 99.722667),
    (o_pelangi, v_v_pelangi, 'Pelangi Beach Resort & Spa', 'pelangi-beach-resort-spa', NULL, 'Pantai Cenang', 'Kedah', 6.299304, 99.721673),
    (o_langkasuka, v_v_langkasuka, 'Hotel Langkasuka', 'hotel-langkasuka', NULL, 'Kuah', 'Kedah', 6.327465, 99.838003),
    (o_samila, v_v_samila, 'Samila Hotel', 'samila-hotel', NULL, 'Alor Setar', 'Kedah', 6.122503, 100.367048)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_mans_breakfast, v_v_mans_cafe, o_mans_cafe, c_food, 'Beach Breakfast Set', 'mans-cafe-breakfast', 'Eggs, toast and fruit, served beachside.', 'food', false, 18.00),
    (p_mans_smoothie, v_v_mans_cafe, o_mans_cafe, c_food, 'Smoothie Bowl', 'mans-cafe-smoothie-bowl', 'Tropical fruit smoothie bowl with granola.', 'food', false, 15.00),
    (p_cliff_seafood, v_v_cliff, o_cliff, c_food, 'Grilled Seafood Platter', 'cliff-grilled-seafood-platter', 'Mixed grilled seafood for two.', 'food', false, 88.00),
    (p_cliff_sunset, v_v_cliff, o_cliff, c_food, 'Sunset Cocktail', 'cliff-sunset-cocktail', 'House cocktail served at sunset.', 'food', false, 28.00),
    (p_yasmin_mezze, v_v_yasmin, o_yasmin, c_food, 'Mezze Platter', 'yasmin-mezze-platter', 'Hummus, falafel and pita selection.', 'food', false, 32.00),
    (p_yasmin_shawarma, v_v_yasmin, o_yasmin, c_food, 'Chicken Shawarma', 'yasmin-chicken-shawarma', 'Spit-roasted chicken shawarma wrap.', 'food', false, 18.00),
    (p_lyy_crab, v_v_lyy_seafood, o_lyy_seafood, c_food, 'Butter Crab', 'lyy-butter-crab', 'Mud crab fried in a butter curry-leaf sauce.', 'food', false, 68.00),
    (p_lyy_fish, v_v_lyy_seafood, o_lyy_seafood, c_food, 'Steamed Seabass', 'lyy-steamed-seabass', 'Whole seabass steamed with ginger.', 'food', false, 45.00),
    (p_chiabee_soup, v_v_chia_bee, o_chia_bee, c_food, 'Bah Kut Teh Set', 'chiabee-bah-kut-teh-set', 'Herbal pork rib soup, served with rice.', 'food', false, 16.00),
    (p_chiabee_rice, v_v_chia_bee, o_chia_bee, c_food, 'Claypot Rice', 'chiabee-claypot-rice', 'Claypot rice with preserved meats.', 'food', false, 14.00),
    (p_nky_ayam, v_v_nk_yasmeen, o_nk_yasmeen, c_food, 'Nasi Kandar Ayam', 'nky-nasi-kandar-ayam', 'Rice with fried chicken and mixed curry.', 'food', false, 10.00),
    (p_nky_roti, v_v_nk_yasmeen, o_nk_yasmeen, c_food, 'Roti Canai', 'nky-roti-canai', 'Griddled flatbread with dhal.', 'food', false, 3.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_pc_batik, v_v_paradise_craft, o_paradise_craft, c_retail, 'Batik Sarong', 'paradise-craft-batik-sarong', 'Hand-dyed batik sarong.', 'product', false, 45.00),
    (p_lm_chocolate, v_v_loyal_maxim, o_loyal_maxim, c_retail, 'Duty-Free Chocolate Box', 'loyal-maxim-chocolate-box', 'Boxed assorted chocolates, duty-free.', 'product', false, 35.00)
  ON CONFLICT (id) DO NOTHING;

  -- Guide services — outlet_id NULL, place-bound only. Real vendors (2
  -- licensed travel agencies), fictional itinerary names — see plan D2.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_guide_kilim_love, v_v_love_island, NULL, c_activity, 'Kilim Mangrove Tour', 'guide-kilim-mangrove-tour', 'Boat tour through the Kilim mangrove and geoforest park.', 'experience', true, 65.00),
    (p_guide_kilim_avante, v_v_avante, NULL, c_activity, 'Kilim Mangrove & Eagle Feeding Tour', 'guide-kilim-mangrove-eagle-tour', 'Mangrove tour with an eagle-feeding stop.', 'experience', true, 75.00),
    (p_guide_gunung_raya, v_v_love_island, NULL, c_activity, 'Gunung Raya Guided Trek', 'guide-gunung-raya-trek', 'Guided trek up Langkawi''s highest peak.', 'experience', true, 90.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_skycab_ticket, v_v_cable_car, o_cable_car, c_activity, 'SkyCab Return Ticket', 'skycab-return-ticket', 'Return cable car ride to the summit and SkyBridge.', 'activity', true, 55.00),
    (p_underwater_ticket, v_v_underwater_op, o_underwater, c_activity, 'Underwater World Entry', 'underwater-world-entry', 'Entry to the Underwater World Langkawi aquarium.', 'activity', true, 48.00),
    (p_menara_ticket, v_v_menara_op, o_menara, c_activity, 'Menara Alor Setar Ticket', 'menara-alor-setar-ticket', 'Entry to the Menara Alor Setar observation deck.', 'activity', true, 15.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_sandy_standard, v_v_sandy_beach, o_sandy_beach, c_accommodation, 'Standard Room', 'sandy-beach-standard-room', 'Standard room at Sandy Beach Resort.', 'service', true, 180.00),
    (p_sandy_deluxe, v_v_sandy_beach, o_sandy_beach, c_accommodation, 'Deluxe Room', 'sandy-beach-deluxe-room', 'Deluxe room at Sandy Beach Resort.', 'service', true, 240.00),
    (p_casa_room, v_v_casa_del_mar, o_casa_del_mar, c_accommodation, 'Sea View Room', 'casa-del-mar-room', 'Sea-view room at Casa del Mar.', 'service', true, 260.00),
    (p_casa_suite, v_v_casa_del_mar, o_casa_del_mar, c_accommodation, 'Beachfront Suite', 'casa-del-mar-suite', 'Beachfront suite at Casa del Mar.', 'service', true, 420.00),
    (p_pelangi_garden, v_v_pelangi, o_pelangi, c_accommodation, 'Garden Room', 'pelangi-garden-room', 'Garden-view room at Pelangi Beach Resort.', 'service', true, 320.00),
    (p_pelangi_beachfront, v_v_pelangi, o_pelangi, c_accommodation, 'Beachfront Room', 'pelangi-beachfront-room', 'Beachfront room at Pelangi Beach Resort.', 'service', true, 480.00),
    (p_langkasuka_standard, v_v_langkasuka, o_langkasuka, c_accommodation, 'Standard Room', 'langkasuka-standard-room', 'Standard room at Hotel Langkasuka.', 'service', true, 110.00),
    (p_langkasuka_deluxe, v_v_langkasuka, o_langkasuka, c_accommodation, 'Deluxe Room', 'langkasuka-deluxe-room', 'Deluxe room at Hotel Langkasuka.', 'service', true, 150.00),
    (p_samila_standard, v_v_samila, o_samila, c_accommodation, 'Standard Room', 'samila-standard-room', 'Standard room at Samila Hotel.', 'service', true, 95.00),
    (p_samila_family, v_v_samila, o_samila, c_accommodation, 'Family Room', 'samila-family-room', 'Family room at Samila Hotel.', 'service', true, 145.00)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('kedah:variant:sandy-standard')::uuid, p_sandy_standard, 'Room Only', 0, true),
    (md5('kedah:variant:sandy-deluxe')::uuid, p_sandy_deluxe, 'Room Only', 0, true),
    (md5('kedah:variant:casa-room')::uuid, p_casa_room, 'Room Only', 0, true),
    (md5('kedah:variant:casa-suite')::uuid, p_casa_suite, 'Room Only', 0, true),
    (md5('kedah:variant:pelangi-garden')::uuid, p_pelangi_garden, 'Room Only', 0, true),
    (md5('kedah:variant:pelangi-beachfront')::uuid, p_pelangi_beachfront, 'Room Only', 0, true),
    (md5('kedah:variant:langkasuka-standard')::uuid, p_langkasuka_standard, 'Standard', 0, true),
    (md5('kedah:variant:langkasuka-deluxe')::uuid, p_langkasuka_deluxe, 'Standard', 0, true),
    (md5('kedah:variant:samila-standard')::uuid, p_samila_standard, 'Standard', 0, true),
    (md5('kedah:variant:samila-family')::uuid, p_samila_family, 'Standard', 0, true),
    (md5('kedah:variant:pc-batik')::uuid, p_pc_batik, 'Standard', 0, true),
    (md5('kedah:variant:lm-chocolate')::uuid, p_lm_chocolate, 'Standard', 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, p.outlet_id
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  WHERE p.id IN (p_pc_batik, p_lm_chocolate)
  ON CONFLICT DO NOTHING;

  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_guide_kilim_love, v_p_kilim_park, 'guide_service'),
    (p_guide_kilim_avante, v_p_kilim_park, 'guide_service'),
    (p_guide_gunung_raya, v_p_gunung_raya, 'guide_service'),
    (p_skycab_ticket, v_p_skycab, 'admission'),
    (p_underwater_ticket, v_p_underwater, 'admission'),
    (p_menara_ticket, v_p_menara, 'admission')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  -- Historical replay — fabricated demo data attached to real business
  -- names. Excludes the 3 guide products (outlet_id IS NULL). 2 orders per
  -- food/attraction product, 1 per accommodation/retail product.
  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-KD-SEED') THEN

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
          (p_mans_breakfast, v_v_mans_cafe, o_mans_cafe, 'Beach Breakfast Set', 18.00::numeric, false, 2),
          (p_mans_smoothie, v_v_mans_cafe, o_mans_cafe, 'Smoothie Bowl', 15.00::numeric, false, 2),
          (p_cliff_seafood, v_v_cliff, o_cliff, 'Grilled Seafood Platter', 88.00::numeric, false, 2),
          (p_cliff_sunset, v_v_cliff, o_cliff, 'Sunset Cocktail', 28.00::numeric, false, 2),
          (p_yasmin_mezze, v_v_yasmin, o_yasmin, 'Mezze Platter', 32.00::numeric, false, 2),
          (p_yasmin_shawarma, v_v_yasmin, o_yasmin, 'Chicken Shawarma', 18.00::numeric, false, 2),
          (p_lyy_crab, v_v_lyy_seafood, o_lyy_seafood, 'Butter Crab', 68.00::numeric, false, 2),
          (p_lyy_fish, v_v_lyy_seafood, o_lyy_seafood, 'Steamed Seabass', 45.00::numeric, false, 2),
          (p_chiabee_soup, v_v_chia_bee, o_chia_bee, 'Bah Kut Teh Set', 16.00::numeric, false, 2),
          (p_chiabee_rice, v_v_chia_bee, o_chia_bee, 'Claypot Rice', 14.00::numeric, false, 2),
          (p_nky_ayam, v_v_nk_yasmeen, o_nk_yasmeen, 'Nasi Kandar Ayam', 10.00::numeric, false, 2),
          (p_nky_roti, v_v_nk_yasmeen, o_nk_yasmeen, 'Roti Canai', 3.00::numeric, false, 2),

          (p_skycab_ticket, v_v_cable_car, o_cable_car, 'SkyCab Return Ticket', 55.00::numeric, true, 2),
          (p_underwater_ticket, v_v_underwater_op, o_underwater, 'Underwater World Entry', 48.00::numeric, true, 2),
          (p_menara_ticket, v_v_menara_op, o_menara, 'Menara Alor Setar Ticket', 15.00::numeric, true, 2),

          (p_pc_batik, v_v_paradise_craft, o_paradise_craft, 'Batik Sarong', 45.00::numeric, false, 1),
          (p_lm_chocolate, v_v_loyal_maxim, o_loyal_maxim, 'Duty-Free Chocolate Box', 35.00::numeric, false, 1),

          (p_sandy_standard, v_v_sandy_beach, o_sandy_beach, 'Standard Room', 180.00::numeric, true, 1),
          (p_sandy_deluxe, v_v_sandy_beach, o_sandy_beach, 'Deluxe Room', 240.00::numeric, true, 1),
          (p_casa_room, v_v_casa_del_mar, o_casa_del_mar, 'Sea View Room', 260.00::numeric, true, 1),
          (p_casa_suite, v_v_casa_del_mar, o_casa_del_mar, 'Beachfront Suite', 420.00::numeric, true, 1),
          (p_pelangi_garden, v_v_pelangi, o_pelangi, 'Garden Room', 320.00::numeric, true, 1),
          (p_pelangi_beachfront, v_v_pelangi, o_pelangi, 'Beachfront Room', 480.00::numeric, true, 1),
          (p_langkasuka_standard, v_v_langkasuka, o_langkasuka, 'Standard Room', 110.00::numeric, true, 1),
          (p_langkasuka_deluxe, v_v_langkasuka, o_langkasuka, 'Deluxe Room', 150.00::numeric, true, 1),
          (p_samila_standard, v_v_samila, o_samila, 'Standard Room', 95.00::numeric, true, 1),
          (p_samila_family, v_v_samila, o_samila, 'Family Room', 145.00::numeric, true, 1)
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
            UPDATE orders SET display_id = 'ORD-KD-SEED' WHERE id = v_order_id;
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
    SELECT vendor_id FROM outlets WHERE state = 'Kedah');
  IF n <> 18 THEN RAISE EXCEPTION 'expected 18 Kedah vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets WHERE state = 'Kedah';
  IF n <> 18 THEN RAISE EXCEPTION 'expected 18 Kedah outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE v.id IN (SELECT vendor_id FROM outlets WHERE state = 'Kedah')
       OR v.id IN (
         md5('kedah:vendor:guide-love-island-tours')::uuid,
         md5('kedah:vendor:guide-avante-holidays')::uuid
       );
  IF n <> 30 THEN RAISE EXCEPTION 'expected 30 Kedah products, found %', n; END IF;

  SELECT count(*) INTO n FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    JOIN outlets o ON o.vendor_id = v.id AND o.state = 'Kedah'
    WHERE p.category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Kedah products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE state = 'Kedah';
  IF n <> 17 THEN RAISE EXCEPTION 'expected 17 Kedah places (1 state + 6 regions + 10 POIs), found %', n; END IF;

  SELECT count(*) INTO n FROM product_places pp
    JOIN places p ON p.id = pp.place_id WHERE p.state = 'Kedah';
  IF n <> 6 THEN RAISE EXCEPTION 'expected 6 Kedah product_places links, found %', n; END IF;
END $$;

COMMIT;
;
