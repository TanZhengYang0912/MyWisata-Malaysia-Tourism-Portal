-- Penang place model — Phase 3: seed data.
-- See docs/plans/2026-08-12-2152-penang-place-model-and-data-reset.md §3.
-- All catalogue-level IDs (places/vendors/outlets/products/variants) are
-- deterministic via md5('penang:<type>:<key>')::uuid, so this file is safe
-- to re-run (every catalogue INSERT uses ON CONFLICT DO NOTHING). The order/
-- review/wallet replay in section 7 is NOT idempotent by design — it is
-- historical filler data, re-running would double it, so it is guarded by a
-- one-time marker check at the top of that section instead.
--
-- Corrections made during authorship vs. the plan's original counts (kept
-- here rather than silently diverging — see plan §3 "Also touched" note):
--  1. Plan §3a lists an operator ("Peranakan Mansion") for Pinang Peranakan
--     Mansion, but §3b's vendor table only budgets 3 operator vendors
--     (Kek Lok Si, Penang Hill, Khoo Kongsi). A 4th operator vendor is added
--     so every POI with a named operator in §3a actually has one.
--  2. §3b says 3 of 4 guide vendors compete at Monkey Beach Trail, but the
--     Phase 3 verification query demands 4 DISTINCT vendors there. With only
--     4 guide vendors and one needed for Armenian Street, this is
--     unsatisfiable. A 5th guide vendor (boat transfer) is added so Monkey
--     Beach Trail gets exactly 4 distinct vendors and Armenian Street still
--     gets its walking tour.
--  3. Guide-service products have no outlet (products.outlet_id NULL, no
--     outlet_offers) by design — that's the whole point of this model. But
--     order_items.outlet_id is NOT NULL, and backend/domains/commerce.ts
--     (explicitly out of scope, untouched) has no path to check out an
--     outlet-less product. Section 7's historical order replay therefore
--     only covers the 31 products that DO have a real outlet (food,
--     operators, accommodation, retail) — guide-service products get
--     catalogue + product_places rows but no replayed order history.
-- Net effect: 19 vendors / 27 outlets / 36 products (plan said 17/26/~40).

DO $$
DECLARE
  -- places
  v_penang uuid := md5('penang:place:penang')::uuid;
  v_george_town uuid := md5('penang:place:george-town')::uuid;
  v_air_itam uuid := md5('penang:place:air-itam')::uuid;
  v_batu_ferringhi uuid := md5('penang:place:batu-ferringhi')::uuid;
  v_teluk_bahang uuid := md5('penang:place:teluk-bahang')::uuid;
  v_balik_pulau uuid := md5('penang:place:balik-pulau')::uuid;

  v_p_armenian uuid := md5('penang:place:armenian-street-murals')::uuid;
  v_p_chew_jetty uuid := md5('penang:place:chew-jetty')::uuid;
  v_p_khoo_kongsi uuid := md5('penang:place:khoo-kongsi')::uuid;
  v_p_peranakan uuid := md5('penang:place:pinang-peranakan-mansion')::uuid;
  v_p_kek_lok_si uuid := md5('penang:place:kek-lok-si-temple')::uuid;
  v_p_penang_hill uuid := md5('penang:place:penang-hill')::uuid;
  v_p_night_market uuid := md5('penang:place:batu-ferringhi-night-market')::uuid;
  v_p_bf_beach uuid := md5('penang:place:batu-ferringhi-beach')::uuid;
  v_p_monkey_beach uuid := md5('penang:place:monkey-beach-trail')::uuid;
  v_p_meromictic uuid := md5('penang:place:meromictic-lake')::uuid;
  v_p_botanic uuid := md5('penang:place:penang-botanic-gardens')::uuid;
  v_p_durian uuid := md5('penang:place:balik-pulau-durian-orchards')::uuid;

  -- vendors
  v_v_kapitan uuid := md5('penang:vendor:food-kapitan')::uuid;
  v_v_ckt uuid := md5('penang:vendor:food-char-koay-teow')::uuid;
  v_v_sky uuid := md5('penang:vendor:food-sky-coffee')::uuid;
  v_v_bfseafood uuid := md5('penang:vendor:food-bf-seafood')::uuid;
  v_v_mb_adventures uuid := md5('penang:vendor:guide-monkey-beach-adventures')::uuid;
  v_v_nature uuid := md5('penang:vendor:guide-penang-nature')::uuid;
  v_v_straits uuid := md5('penang:vendor:guide-straits-trail')::uuid;
  v_v_boat uuid := md5('penang:vendor:guide-teluk-bahang-boat')::uuid;
  v_v_heritage_walks uuid := md5('penang:vendor:guide-gt-heritage-walks')::uuid;
  v_v_op_kls uuid := md5('penang:vendor:op-kek-lok-si')::uuid;
  v_v_op_hill uuid := md5('penang:vendor:op-penang-hill')::uuid;
  v_v_op_khoo uuid := md5('penang:vendor:op-khoo-kongsi')::uuid;
  v_v_op_peranakan uuid := md5('penang:vendor:op-peranakan-mansion')::uuid;
  v_v_heritage_row uuid := md5('penang:vendor:accom-heritage-row')::uuid;
  v_v_bf_resort uuid := md5('penang:vendor:accom-bf-beach-resort')::uuid;
  v_v_homestay uuid := md5('penang:vendor:accom-air-itam-homestay')::uuid;
  v_v_batik uuid := md5('penang:vendor:retail-batik-crafts')::uuid;
  v_v_spice uuid := md5('penang:vendor:retail-spice-traders')::uuid;
  v_v_bookshop uuid := md5('penang:vendor:retail-heritage-bookshop')::uuid;

  -- demo owners (existing users, preserved by Phase 1)
  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  -- outlets
  o_kapitan_komtar uuid := md5('penang:outlet:kapitan-komtar')::uuid;
  o_kapitan_jetty uuid := md5('penang:outlet:kapitan-jetty')::uuid;
  o_kapitan_gurney uuid := md5('penang:outlet:kapitan-gurney')::uuid;
  o_kapitan_bf uuid := md5('penang:outlet:kapitan-bf')::uuid;
  o_ckt_carnarvon uuid := md5('penang:outlet:ckt-lebuh-carnarvon')::uuid;
  o_ckt_new_lane uuid := md5('penang:outlet:ckt-new-lane')::uuid;
  o_ckt_gurney uuid := md5('penang:outlet:ckt-gurney')::uuid;
  o_ckt_air_itam uuid := md5('penang:outlet:ckt-air-itam')::uuid;
  o_sky_armenian uuid := md5('penang:outlet:sky-armenian')::uuid;
  o_sky_china_street uuid := md5('penang:outlet:sky-china-street')::uuid;
  o_sky_macalister uuid := md5('penang:outlet:sky-macalister')::uuid;
  o_sky_tanjung_bungah uuid := md5('penang:outlet:sky-tanjung-bungah')::uuid;
  o_bfs_main uuid := md5('penang:outlet:bfseafood-main')::uuid;
  o_bfs_jetty uuid := md5('penang:outlet:bfseafood-jetty')::uuid;
  o_bfs_teluk_bahang uuid := md5('penang:outlet:bfseafood-teluk-bahang')::uuid;
  o_bfs_tanjung_bungah uuid := md5('penang:outlet:bfseafood-tanjung-bungah')::uuid;
  o_op_kls uuid := md5('penang:outlet:op-kek-lok-si')::uuid;
  o_op_hill uuid := md5('penang:outlet:op-penang-hill')::uuid;
  o_op_khoo uuid := md5('penang:outlet:op-khoo-kongsi')::uuid;
  o_op_peranakan uuid := md5('penang:outlet:op-peranakan-mansion')::uuid;
  o_heritage_row uuid := md5('penang:outlet:accom-heritage-row')::uuid;
  o_bf_resort uuid := md5('penang:outlet:accom-bf-beach-resort')::uuid;
  o_homestay_1 uuid := md5('penang:outlet:accom-air-itam-homestay-1')::uuid;
  o_homestay_2 uuid := md5('penang:outlet:accom-air-itam-homestay-2')::uuid;
  o_batik uuid := md5('penang:outlet:retail-batik-crafts')::uuid;
  o_spice uuid := md5('penang:outlet:retail-spice-traders')::uuid;
  o_bookshop uuid := md5('penang:outlet:retail-heritage-bookshop')::uuid;

  -- products (only the ones referenced later by outlet_offers/variants/product_places)
  p_kapitan_set uuid := md5('penang:product:kapitan-nasi-kandar-set')::uuid;
  p_kapitan_rendang uuid := md5('penang:product:kapitan-beef-rendang-rice')::uuid;
  p_kapitan_teh uuid := md5('penang:product:kapitan-teh-tarik')::uuid;
  p_kapitan_cendol uuid := md5('penang:product:kapitan-durian-cendol')::uuid;
  p_ckt_main uuid := md5('penang:product:ckt-char-koay-teow')::uuid;
  p_ckt_curry_mee uuid := md5('penang:product:ckt-curry-mee')::uuid;
  p_ckt_cendol uuid := md5('penang:product:ckt-penang-cendol')::uuid;
  p_ckt_loh_bak uuid := md5('penang:product:ckt-air-itam-loh-bak')::uuid;
  p_sky_kaya uuid := md5('penang:product:sky-kaya-toast-set')::uuid;
  p_sky_coffee uuid := md5('penang:product:sky-ipoh-white-coffee')::uuid;
  p_sky_eggs uuid := md5('penang:product:sky-half-boiled-eggs')::uuid;
  p_sky_laksa uuid := md5('penang:product:sky-nyonya-laksa')::uuid;
  p_bfs_stingray uuid := md5('penang:product:bfs-grilled-stingray')::uuid;
  p_bfs_prawns uuid := md5('penang:product:bfs-salted-egg-prawns')::uuid;
  p_bfs_squid uuid := md5('penang:product:bfs-butter-squid')::uuid;
  p_bfs_crab uuid := md5('penang:product:bfs-chilli-crab-feast')::uuid;

  p_guide_mb_trek uuid := md5('penang:product:guide-monkey-beach-trek')::uuid;
  p_guide_jungle uuid := md5('penang:product:guide-monkey-beach-jungle-package')::uuid;
  p_guide_sunset uuid := md5('penang:product:guide-monkey-beach-sunset-trek')::uuid;
  p_guide_boat uuid := md5('penang:product:guide-monkey-beach-boat-transfer')::uuid;
  p_guide_armenian uuid := md5('penang:product:guide-armenian-street-walking-tour')::uuid;

  p_op_kls_entry uuid := md5('penang:product:op-kek-lok-si-entry')::uuid;
  p_op_hill_ticket uuid := md5('penang:product:op-penang-hill-funicular-ticket')::uuid;
  p_op_hill_skywalk uuid := md5('penang:product:op-penang-hill-skywalk')::uuid;
  p_op_khoo_entry uuid := md5('penang:product:op-khoo-kongsi-entry')::uuid;
  p_op_peranakan_entry uuid := md5('penang:product:op-peranakan-mansion-entry')::uuid;

  p_accom_heritage_room uuid := md5('penang:product:accom-heritage-room')::uuid;
  p_accom_sea_view uuid := md5('penang:product:accom-sea-view-room')::uuid;
  p_accom_homestay_1 uuid := md5('penang:product:accom-homestay-room')::uuid;
  p_accom_homestay_2 uuid := md5('penang:product:accom-family-homestay-room')::uuid;

  p_batik_sarong uuid := md5('penang:product:retail-batik-sarong')::uuid;
  p_batik_keychain uuid := md5('penang:product:retail-songket-keychain-set')::uuid;
  p_spice_mix uuid := md5('penang:product:retail-spice-mix-gift-set')::uuid;
  p_spice_tea uuid := md5('penang:product:retail-nyonya-tea-set')::uuid;
  p_book_postcards uuid := md5('penang:product:retail-postcard-set')::uuid;
  p_book_photobook uuid := md5('penang:product:retail-heritage-photobook')::uuid;

BEGIN

-- ═══════════════════════════════════════════════════════════════════════
-- 1. VENDORS (19) — cycled across the 3 demo vendor_owner accounts
--    (Inserted before places: places.managed_by_vendor_id references
--    vendors, so vendors must exist first.)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO vendors (id, owner_id, name, slug, description, business_type, status, approved_at)
VALUES
  (v_v_kapitan, v_owner_ali, 'Kapitan Nasi Kandar', 'kapitan-nasi-kandar', 'Mamak-style nasi kandar chain serving George Town since 1998.', 'food', 'approved', now()),
  (v_v_ckt, v_owner_raj, 'Auntie Gaik Lean''s Char Koay Teow', 'auntie-gaik-lean-ckt', 'Wok-fried Penang hawker classics across four stalls.', 'food', 'approved', now()),
  (v_v_sky, v_owner_siti, 'Sky Coffee House', 'sky-coffee-house', 'Traditional kopitiam breakfast and Ipoh-style white coffee.', 'food', 'approved', now()),
  (v_v_bfseafood, v_owner_ali, 'Batu Ferringhi Seafood Grill', 'batu-ferringhi-seafood-grill', 'Beachside seafood grills along the Batu Ferringhi strip.', 'food', 'approved', now()),

  (v_v_mb_adventures, v_owner_raj, 'Monkey Beach Adventures', 'monkey-beach-adventures', 'Independent trekking guides for the Monkey Beach trail.', 'activity', 'approved', now()),
  (v_v_nature, v_owner_siti, 'Penang Nature Guides', 'penang-nature-guides', 'Naturalist-led jungle and coastal walks in Teluk Bahang.', 'activity', 'approved', now()),
  (v_v_straits, v_owner_ali, 'Straits Trail Guides', 'straits-trail-guides', 'Small-group sunset treks along the northern coastline.', 'activity', 'approved', now()),
  (v_v_boat, v_owner_raj, 'Teluk Bahang Boat Services', 'teluk-bahang-boat-services', 'Boat transfers between Teluk Bahang jetty and Monkey Beach.', 'activity', 'approved', now()),
  (v_v_heritage_walks, v_owner_siti, 'George Town Heritage Walks', 'george-town-heritage-walks', 'Guided mural and clan-jetty walking tours of the UNESCO core zone.', 'activity', 'approved', now()),

  (v_v_op_kls, v_owner_ali, 'Kek Lok Si Temple', 'kek-lok-si-temple-vendor', 'Operator of the Kek Lok Si Temple complex.', 'attraction', 'approved', now()),
  (v_v_op_hill, v_owner_raj, 'Penang Hill Corporation', 'penang-hill-corporation', 'Operator of the Penang Hill funicular railway.', 'attraction', 'approved', now()),
  (v_v_op_khoo, v_owner_siti, 'Khoo Kongsi Trust', 'khoo-kongsi-trust', 'Custodian of the Khoo Kongsi clan temple.', 'attraction', 'approved', now()),
  (v_v_op_peranakan, v_owner_ali, 'Pinang Peranakan Mansion', 'pinang-peranakan-mansion-vendor', 'Operator of the Pinang Peranakan Mansion museum.', 'attraction', 'approved', now()),

  (v_v_heritage_row, v_owner_raj, 'Heritage Row Boutique Hotel', 'heritage-row-boutique-hotel', 'Restored shophouse hotel in the George Town heritage core.', 'accommodation', 'approved', now()),
  (v_v_bf_resort, v_owner_siti, 'Batu Ferringhi Beach Resort', 'batu-ferringhi-beach-resort', 'Beachfront resort along Batu Ferringhi.', 'accommodation', 'approved', now()),
  (v_v_homestay, v_owner_ali, 'Air Itam Homestay Collective', 'air-itam-homestay-collective', 'Family-run homestays near Kek Lok Si.', 'accommodation', 'approved', now()),

  (v_v_batik, v_owner_raj, 'Batu Ferringhi Batik & Crafts', 'batu-ferringhi-batik-crafts', 'Hand-blocked batik and local crafts.', 'retail', 'approved', now()),
  (v_v_spice, v_owner_siti, 'George Town Spice Traders', 'george-town-spice-traders', 'Spice blends and Nyonya kitchenware.', 'retail', 'approved', now()),
  (v_v_bookshop, v_owner_ali, 'Penang Heritage Bookshop', 'penang-heritage-bookshop', 'Local history books and postcards.', 'retail', 'approved', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id, vendor_id)
SELECT v.owner_id, v_role_vendor_owner, v.id
FROM vendors v
WHERE v.id IN (
  v_v_kapitan, v_v_ckt, v_v_sky, v_v_bfseafood,
  v_v_mb_adventures, v_v_nature, v_v_straits, v_v_boat, v_v_heritage_walks,
  v_v_op_kls, v_v_op_hill, v_v_op_khoo, v_v_op_peranakan,
  v_v_heritage_row, v_v_bf_resort, v_v_homestay,
  v_v_batik, v_v_spice, v_v_bookshop
)
ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. PLACES — 1 state, 5 regions, 12 POIs
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO places (id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, managed_by_vendor_id, image_url)
VALUES
  (v_penang, NULL, 'state', 'Penang', 'penang', 'Penang', NULL, 5.4141, 100.3288, NULL, NULL, '/assets/customer/malaysia/penang-george-town.webp'),
  (v_george_town, v_penang, 'region', 'George Town', 'george-town', 'Penang', 'George Town', 5.4141, 100.3288, NULL, NULL, NULL),
  (v_air_itam, v_penang, 'region', 'Air Itam', 'air-itam', 'Penang', 'Air Itam', 5.3988, 100.2761, NULL, NULL, NULL),
  (v_batu_ferringhi, v_penang, 'region', 'Batu Ferringhi', 'batu-ferringhi', 'Penang', 'Batu Ferringhi', 5.4728, 100.2450, NULL, NULL, NULL),
  (v_teluk_bahang, v_penang, 'region', 'Teluk Bahang', 'teluk-bahang', 'Penang', 'Teluk Bahang', 5.4646, 100.2119, NULL, NULL, NULL),
  (v_balik_pulau, v_penang, 'region', 'Balik Pulau', 'balik-pulau', 'Penang', 'Balik Pulau', 5.3556, 100.2214, NULL, NULL, NULL),

  (v_p_armenian, v_george_town, 'poi', 'Armenian Street Murals', 'armenian-street-murals', 'Penang', 'George Town', 5.4173, 100.3390, 0, NULL, NULL),
  (v_p_chew_jetty, v_george_town, 'poi', 'Chew Jetty', 'chew-jetty', 'Penang', 'George Town', 5.4145, 100.3401, 0, NULL, NULL),
  (v_p_khoo_kongsi, v_george_town, 'poi', 'Khoo Kongsi', 'khoo-kongsi', 'Penang', 'George Town', 5.4145, 100.3370, 15.00, v_v_op_khoo, NULL),
  (v_p_peranakan, v_george_town, 'poi', 'Pinang Peranakan Mansion', 'pinang-peranakan-mansion', 'Penang', 'George Town', 5.4180, 100.3380, 25.00, v_v_op_peranakan, NULL),
  (v_p_kek_lok_si, v_air_itam, 'poi', 'Kek Lok Si Temple', 'kek-lok-si-temple', 'Penang', 'Air Itam', 5.3989, 100.2745, 0, v_v_op_kls, NULL),
  (v_p_penang_hill, v_air_itam, 'poi', 'Penang Hill', 'penang-hill', 'Penang', 'Air Itam', 5.4228, 100.2762, 30.00, v_v_op_hill, NULL),
  (v_p_night_market, v_batu_ferringhi, 'poi', 'Batu Ferringhi Night Market', 'batu-ferringhi-night-market', 'Penang', 'Batu Ferringhi', 5.4735, 100.2465, 0, NULL, NULL),
  (v_p_bf_beach, v_batu_ferringhi, 'poi', 'Batu Ferringhi Beach', 'batu-ferringhi-beach', 'Penang', 'Batu Ferringhi', 5.4740, 100.2440, 0, NULL, NULL),
  (v_p_monkey_beach, v_teluk_bahang, 'poi', 'Monkey Beach Trail', 'monkey-beach-trail', 'Penang', 'Teluk Bahang', 5.4720, 100.2020, 0, NULL, NULL),
  (v_p_meromictic, v_teluk_bahang, 'poi', 'Meromictic Lake', 'meromictic-lake', 'Penang', 'Teluk Bahang', 5.4680, 100.2050, 0, NULL, NULL),
  (v_p_botanic, v_george_town, 'poi', 'Penang Botanic Gardens', 'penang-botanic-gardens', 'Penang', 'George Town', 5.4079, 100.2789, 0, NULL, NULL),
  (v_p_durian, v_balik_pulau, 'poi', 'Balik Pulau Durian Orchards', 'balik-pulau-durian-orchards', 'Penang', 'Balik Pulau', 5.3480, 100.2150, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. OUTLETS (27)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
VALUES
  (o_kapitan_komtar, v_v_kapitan, 'Kapitan Nasi Kandar — Komtar', 'kapitan-komtar', 'Jalan Penang, Komtar', 'George Town', 'Penang', 5.4115, 100.3308),
  (o_kapitan_jetty, v_v_kapitan, 'Kapitan Nasi Kandar — Weld Quay', 'kapitan-jetty', 'Pengkalan Weld', 'George Town', 'Penang', 5.4160, 100.3420),
  (o_kapitan_gurney, v_v_kapitan, 'Kapitan Nasi Kandar — Gurney', 'kapitan-gurney', 'Gurney Drive', 'George Town', 'Penang', 5.4380, 100.3090),
  (o_kapitan_bf, v_v_kapitan, 'Kapitan Nasi Kandar — Batu Ferringhi', 'kapitan-batu-ferringhi', 'Jalan Batu Ferringhi', 'Batu Ferringhi', 'Penang', 5.4735, 100.2460),

  (o_ckt_carnarvon, v_v_ckt, 'Auntie Gaik Lean''s — Lebuh Carnarvon', 'ckt-lebuh-carnarvon', 'Lebuh Carnarvon', 'George Town', 'Penang', 5.4160, 100.3350),
  (o_ckt_new_lane, v_v_ckt, 'Auntie Gaik Lean''s — New Lane', 'ckt-new-lane', 'Lorong Baru (New Lane)', 'George Town', 'Penang', 5.4085, 100.3195),
  (o_ckt_gurney, v_v_ckt, 'Auntie Gaik Lean''s — Gurney', 'ckt-gurney', 'Gurney Drive', 'George Town', 'Penang', 5.4380, 100.3090),
  (o_ckt_air_itam, v_v_ckt, 'Auntie Gaik Lean''s — Air Itam', 'ckt-air-itam', 'Air Itam Market', 'Air Itam', 'Penang', 5.3990, 100.2760),

  (o_sky_armenian, v_v_sky, 'Sky Coffee House — Armenian Street', 'sky-armenian-street', 'Lebuh Armenian', 'George Town', 'Penang', 5.4173, 100.3390),
  (o_sky_china_street, v_v_sky, 'Sky Coffee House — China Street', 'sky-china-street', 'Lebuh China', 'George Town', 'Penang', 5.4155, 100.3410),
  (o_sky_macalister, v_v_sky, 'Sky Coffee House — Macalister', 'sky-macalister-road', 'Macalister Road', 'George Town', 'Penang', 5.4090, 100.3230),
  (o_sky_tanjung_bungah, v_v_sky, 'Sky Coffee House — Tanjung Bungah', 'sky-tanjung-bungah', 'Jalan Tanjung Bungah', 'Tanjung Bungah', 'Penang', 5.4550, 100.2870),

  (o_bfs_main, v_v_bfseafood, 'Batu Ferringhi Seafood Grill — Main', 'bfseafood-main', 'Jalan Batu Ferringhi', 'Batu Ferringhi', 'Penang', 5.4730, 100.2455),
  (o_bfs_jetty, v_v_bfseafood, 'Batu Ferringhi Seafood Grill — Jetty', 'bfseafood-jetty', 'Batu Ferringhi Jetty Road', 'Batu Ferringhi', 'Penang', 5.4720, 100.2430),
  (o_bfs_teluk_bahang, v_v_bfseafood, 'Batu Ferringhi Seafood Grill — Teluk Bahang', 'bfseafood-teluk-bahang', 'Jalan Teluk Bahang', 'Teluk Bahang', 'Penang', 5.4640, 100.2130),
  (o_bfs_tanjung_bungah, v_v_bfseafood, 'Batu Ferringhi Seafood Grill — Tanjung Bungah', 'bfseafood-tanjung-bungah', 'Jalan Tanjung Bungah', 'Tanjung Bungah', 'Penang', 5.4560, 100.2880),

  (o_op_kls, v_v_op_kls, 'Kek Lok Si Temple — Main Entrance', 'kek-lok-si-main-entrance', 'Kek Lok Si, Air Itam', 'Air Itam', 'Penang', 5.3989, 100.2745),
  (o_op_hill, v_v_op_hill, 'Penang Hill — Lower Station', 'penang-hill-lower-station', 'Jalan Bukit Bendera', 'Air Itam', 'Penang', 5.4228, 100.2762),
  (o_op_khoo, v_v_op_khoo, 'Khoo Kongsi — Ticket Counter', 'khoo-kongsi-ticket-counter', 'Cannon Square', 'George Town', 'Penang', 5.4145, 100.3370),
  (o_op_peranakan, v_v_op_peranakan, 'Pinang Peranakan Mansion — Front Desk', 'peranakan-mansion-front-desk', 'Church Street', 'George Town', 'Penang', 5.4180, 100.3380),

  (o_heritage_row, v_v_heritage_row, 'Heritage Row Boutique Hotel', 'heritage-row-boutique-hotel', 'Love Lane', 'George Town', 'Penang', 5.4175, 100.3365),
  (o_bf_resort, v_v_bf_resort, 'Batu Ferringhi Beach Resort', 'batu-ferringhi-beach-resort-outlet', 'Jalan Batu Ferringhi', 'Batu Ferringhi', 'Penang', 5.4740, 100.2445),
  (o_homestay_1, v_v_homestay, 'Air Itam Homestay — House 1', 'air-itam-homestay-house-1', 'Jalan Air Itam', 'Air Itam', 'Penang', 5.3985, 100.2760),
  (o_homestay_2, v_v_homestay, 'Air Itam Homestay — House 2', 'air-itam-homestay-house-2', 'Jalan Paya Terubong', 'Air Itam', 'Penang', 5.4010, 100.2790),

  (o_batik, v_v_batik, 'Batu Ferringhi Batik & Crafts', 'batu-ferringhi-batik-crafts-outlet', 'Batu Ferringhi Night Market', 'Batu Ferringhi', 'Penang', 5.4735, 100.2465),
  (o_spice, v_v_spice, 'George Town Spice Traders', 'george-town-spice-traders-outlet', 'Lebuh Chulia', 'George Town', 'Penang', 5.4160, 100.3395),
  (o_bookshop, v_v_bookshop, 'Penang Heritage Bookshop', 'penang-heritage-bookshop-outlet', 'Armenian Street', 'George Town', 'Penang', 5.4178, 100.3375)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. PRODUCTS
-- ═══════════════════════════════════════════════════════════════════════

-- 4a. Food — shared products (outlet_id NULL, sold via outlet_offers)
INSERT INTO products (id, vendor_id, outlet_id, name, slug, description, product_type, requires_booking, base_price)
VALUES
  (p_kapitan_set, v_v_kapitan, NULL, 'Nasi Kandar Set', 'kapitan-nasi-kandar-set', 'Steamed rice with a choice of curries and sides.', 'food', false, 12.90),
  (p_kapitan_rendang, v_v_kapitan, NULL, 'Beef Rendang Rice', 'kapitan-beef-rendang-rice', 'Slow-cooked beef rendang over rice.', 'food', false, 14.50),
  (p_kapitan_teh, v_v_kapitan, NULL, 'Teh Tarik', 'kapitan-teh-tarik', 'Hand-pulled milk tea.', 'food', false, 3.50),
  (p_ckt_main, v_v_ckt, NULL, 'Char Koay Teow', 'ckt-char-koay-teow', 'Wok-fried flat rice noodles with prawns and cockles.', 'food', false, 9.00),
  (p_ckt_curry_mee, v_v_ckt, NULL, 'Curry Mee', 'ckt-curry-mee', 'Noodles in spiced coconut curry broth.', 'food', false, 8.50),
  (p_ckt_cendol, v_v_ckt, NULL, 'Penang Cendol', 'ckt-penang-cendol', 'Shaved ice dessert with palm sugar and coconut milk.', 'food', false, 6.00),
  (p_sky_kaya, v_v_sky, NULL, 'Kaya Toast Set', 'sky-kaya-toast-set', 'Charcoal-toasted bread with kaya and butter.', 'food', false, 7.90),
  (p_sky_coffee, v_v_sky, NULL, 'Ipoh White Coffee', 'sky-ipoh-white-coffee', 'Traditional roasted white coffee.', 'food', false, 5.50),
  (p_sky_eggs, v_v_sky, NULL, 'Half-Boiled Eggs', 'sky-half-boiled-eggs', 'Soft eggs with soy sauce and white pepper.', 'food', false, 4.00),
  (p_bfs_stingray, v_v_bfseafood, NULL, 'Grilled Stingray', 'bfs-grilled-stingray', 'Charcoal-grilled stingray in sambal.', 'food', false, 22.00),
  (p_bfs_prawns, v_v_bfseafood, NULL, 'Salted Egg Prawns', 'bfs-salted-egg-prawns', 'Prawns wok-fried in salted egg yolk sauce.', 'food', false, 26.00),
  (p_bfs_squid, v_v_bfseafood, NULL, 'Butter Squid', 'bfs-butter-squid', 'Crispy squid in butter cream sauce.', 'food', false, 24.00)
ON CONFLICT (id) DO NOTHING;

-- 4b. Food — single-outlet specialities (outlet_id set directly, no outlet_offers)
INSERT INTO products (id, vendor_id, outlet_id, name, slug, description, product_type, requires_booking, base_price)
VALUES
  (p_kapitan_cendol, v_v_kapitan, o_kapitan_bf, 'Durian Cendol', 'kapitan-durian-cendol', 'Cendol topped with fresh durian, Batu Ferringhi outlet only.', 'food', false, 8.90),
  (p_ckt_loh_bak, v_v_ckt, o_ckt_air_itam, 'Air Itam Loh Bak', 'ckt-air-itam-loh-bak', 'Five-spice rolls, Air Itam outlet only.', 'food', false, 7.50),
  (p_sky_laksa, v_v_sky, o_sky_tanjung_bungah, 'Nyonya Laksa', 'sky-nyonya-laksa', 'Coconut-based laksa, Tanjung Bungah outlet only.', 'food', false, 11.00),
  (p_bfs_crab, v_v_bfseafood, o_bfs_teluk_bahang, 'Chilli Crab Feast', 'bfs-chilli-crab-feast', 'Whole crab in chilli sauce, Teluk Bahang outlet only.', 'food', false, 68.00)
ON CONFLICT (id) DO NOTHING;

-- 4c. Guide-service activities — no outlet, place-bound via product_places
INSERT INTO products (id, vendor_id, outlet_id, name, slug, description, product_type, requires_booking, base_price)
VALUES
  (p_guide_mb_trek, v_v_mb_adventures, NULL, 'Monkey Beach Guided Trek', 'guide-monkey-beach-trek', 'Guided jungle trek from Teluk Bahang to Monkey Beach.', 'experience', true, 45.00),
  (p_guide_jungle, v_v_nature, NULL, 'Monkey Beach Jungle Trail Package', 'guide-monkey-beach-jungle-package', 'Naturalist-led package covering the jungle trail and beach.', 'experience', true, 55.00),
  (p_guide_sunset, v_v_straits, NULL, 'Monkey Beach Sunset Trek', 'guide-monkey-beach-sunset-trek', 'Small-group sunset trek to Monkey Beach.', 'experience', true, 50.00),
  (p_guide_boat, v_v_boat, NULL, 'Monkey Beach Boat Transfer', 'guide-monkey-beach-boat-transfer', 'Boat transfer between Teluk Bahang jetty and Monkey Beach.', 'experience', true, 20.00),
  (p_guide_armenian, v_v_heritage_walks, NULL, 'Armenian Street Art & Mural Walking Tour', 'guide-armenian-street-walking-tour', 'Guided walking tour of George Town''s street art and murals.', 'experience', true, 35.00)
ON CONFLICT (id) DO NOTHING;

-- 4d. Attraction operators — tied to their own outlet
INSERT INTO products (id, vendor_id, outlet_id, name, slug, description, product_type, requires_booking, base_price)
VALUES
  (p_op_kls_entry, v_v_op_kls, o_op_kls, 'Kek Lok Si Temple Entry', 'op-kek-lok-si-entry', 'Free entry to the Kek Lok Si Temple complex.', 'activity', true, 0.00),
  (p_op_hill_ticket, v_v_op_hill, o_op_hill, 'Penang Hill Funicular Ticket', 'op-penang-hill-funicular-ticket', 'Return funicular ride to the summit of Penang Hill.', 'activity', true, 30.00),
  (p_op_hill_skywalk, v_v_op_hill, o_op_hill, 'Penang Hill Skywalk Add-on', 'op-penang-hill-skywalk', 'Access to The Habitat skywalk at the summit.', 'activity', true, 5.00),
  (p_op_khoo_entry, v_v_op_khoo, o_op_khoo, 'Khoo Kongsi Clan Temple Entry', 'op-khoo-kongsi-entry', 'Entry to the Khoo Kongsi clan temple and museum.', 'activity', true, 15.00),
  (p_op_peranakan_entry, v_v_op_peranakan, o_op_peranakan, 'Pinang Peranakan Mansion Entry', 'op-peranakan-mansion-entry', 'Entry to the Pinang Peranakan Mansion museum.', 'activity', true, 25.00)
ON CONFLICT (id) DO NOTHING;

-- 4e. Accommodation — room type = product
INSERT INTO products (id, vendor_id, outlet_id, name, slug, description, product_type, requires_booking, base_price)
VALUES
  (p_accom_heritage_room, v_v_heritage_row, o_heritage_row, 'Deluxe Heritage Room', 'accom-heritage-room', 'Restored shophouse room with courtyard view.', 'service', true, 180.00),
  (p_accom_sea_view, v_v_bf_resort, o_bf_resort, 'Sea View Room', 'accom-sea-view-room', 'Resort room with a Straits of Malacca view.', 'service', true, 250.00),
  (p_accom_homestay_1, v_v_homestay, o_homestay_1, 'Homestay Room', 'accom-homestay-room', 'Family-run homestay room near Kek Lok Si.', 'service', true, 90.00),
  (p_accom_homestay_2, v_v_homestay, o_homestay_2, 'Family Homestay Room', 'accom-family-homestay-room', 'Larger homestay room for families.', 'service', true, 150.00)
ON CONFLICT (id) DO NOTHING;

-- 4f. Retail — physical goods, tracked via inventory
INSERT INTO products (id, vendor_id, outlet_id, name, slug, description, product_type, requires_booking, base_price)
VALUES
  (p_batik_sarong, v_v_batik, o_batik, 'Batik Sarong', 'retail-batik-sarong', 'Hand-blocked batik sarong.', 'product', false, 45.00),
  (p_batik_keychain, v_v_batik, o_batik, 'Songket Keychain Set', 'retail-songket-keychain-set', 'Set of woven songket keychains.', 'product', false, 12.00),
  (p_spice_mix, v_v_spice, o_spice, 'Penang Spice Mix Gift Set', 'retail-spice-mix-gift-set', 'Curated set of Penang spice blends.', 'product', false, 28.00),
  (p_spice_tea, v_v_spice, o_spice, 'Nyonya Tea Set', 'retail-nyonya-tea-set', 'Peranakan-style ceramic tea set.', 'product', false, 38.00),
  (p_book_postcards, v_v_bookshop, o_bookshop, 'George Town Postcard Set', 'retail-postcard-set', 'Set of 10 George Town heritage postcards.', 'product', false, 15.00),
  (p_book_photobook, v_v_bookshop, o_bookshop, 'Penang Heritage Photobook', 'retail-heritage-photobook', 'Coffee-table photobook of Penang heritage sites.', 'product', false, 55.00)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. outlet_offers — shared food products at all 4 outlets of their vendor
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO outlet_offers (product_id, outlet_id, price)
SELECT p.id, o.id, p.base_price
FROM (VALUES (p_kapitan_set), (p_kapitan_rendang), (p_kapitan_teh)) AS pr(id)
JOIN products p ON p.id = pr.id
CROSS JOIN (VALUES (o_kapitan_komtar), (o_kapitan_jetty), (o_kapitan_gurney), (o_kapitan_bf)) AS o(id)
ON CONFLICT (product_id, outlet_id) DO NOTHING;

INSERT INTO outlet_offers (product_id, outlet_id, price)
SELECT p.id, o.id, p.base_price
FROM (VALUES (p_ckt_main), (p_ckt_curry_mee), (p_ckt_cendol)) AS pr(id)
JOIN products p ON p.id = pr.id
CROSS JOIN (VALUES (o_ckt_carnarvon), (o_ckt_new_lane), (o_ckt_gurney), (o_ckt_air_itam)) AS o(id)
ON CONFLICT (product_id, outlet_id) DO NOTHING;

INSERT INTO outlet_offers (product_id, outlet_id, price)
SELECT p.id, o.id, p.base_price
FROM (VALUES (p_sky_kaya), (p_sky_coffee), (p_sky_eggs)) AS pr(id)
JOIN products p ON p.id = pr.id
CROSS JOIN (VALUES (o_sky_armenian), (o_sky_china_street), (o_sky_macalister), (o_sky_tanjung_bungah)) AS o(id)
ON CONFLICT (product_id, outlet_id) DO NOTHING;

INSERT INTO outlet_offers (product_id, outlet_id, price)
SELECT p.id, o.id, p.base_price
FROM (VALUES (p_bfs_stingray), (p_bfs_prawns), (p_bfs_squid)) AS pr(id)
JOIN products p ON p.id = pr.id
CROSS JOIN (VALUES (o_bfs_main), (o_bfs_jetty), (o_bfs_teluk_bahang), (o_bfs_tanjung_bungah)) AS o(id)
ON CONFLICT (product_id, outlet_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Variants + inventory (retail) / rate plans (accommodation)
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
VALUES
  (md5('penang:variant:accom-heritage-room-only')::uuid, p_accom_heritage_room, 'Room Only', 0, true),
  (md5('penang:variant:accom-heritage-breakfast')::uuid, p_accom_heritage_room, 'Breakfast Included', 30, false),
  (md5('penang:variant:accom-sea-view-room-only')::uuid, p_accom_sea_view, 'Room Only', 0, true),
  (md5('penang:variant:accom-sea-view-breakfast')::uuid, p_accom_sea_view, 'Breakfast Included', 35, false),
  (md5('penang:variant:accom-homestay-1-standard')::uuid, p_accom_homestay_1, 'Standard', 0, true),
  (md5('penang:variant:accom-homestay-2-standard')::uuid, p_accom_homestay_2, 'Standard', 0, true),
  (md5('penang:variant:retail-batik-blue')::uuid, p_batik_sarong, 'Blue Pattern', 0, true),
  (md5('penang:variant:retail-batik-red')::uuid, p_batik_sarong, 'Red Pattern', 0, false),
  (md5('penang:variant:retail-keychain-standard')::uuid, p_batik_keychain, 'Standard', 0, true),
  (md5('penang:variant:retail-spice-mix-standard')::uuid, p_spice_mix, 'Standard', 0, true),
  (md5('penang:variant:retail-spice-tea-standard')::uuid, p_spice_tea, 'Standard', 0, true),
  (md5('penang:variant:retail-postcards-standard')::uuid, p_book_postcards, 'Standard', 0, true),
  (md5('penang:variant:retail-photobook-standard')::uuid, p_book_photobook, 'Standard', 0, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
SELECT v.id, 50, 0, p.outlet_id
FROM product_variants v
JOIN products p ON p.id = v.product_id
WHERE p.id IN (p_batik_sarong, p_batik_keychain, p_spice_mix, p_spice_tea, p_book_postcards, p_book_photobook)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. product_places — the load-bearing links
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO product_places (product_id, place_id, relation_type)
VALUES
  (p_guide_mb_trek, v_p_monkey_beach, 'guide_service'),
  (p_guide_jungle, v_p_monkey_beach, 'guide_service'),
  (p_guide_sunset, v_p_monkey_beach, 'guide_service'),
  (p_guide_boat, v_p_monkey_beach, 'addon'),
  (p_guide_armenian, v_p_armenian, 'guide_service'),
  (p_op_kls_entry, v_p_kek_lok_si, 'admission'),
  (p_op_hill_ticket, v_p_penang_hill, 'admission'),
  (p_op_hill_skywalk, v_p_penang_hill, 'addon'),
  (p_op_khoo_entry, v_p_khoo_kongsi, 'admission'),
  (p_op_peranakan_entry, v_p_peranakan, 'admission')
ON CONFLICT (product_id, place_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Historical replay — orders/order_items/bookings/reviews/wallets
--    Only for the 31 products that have a real outlet (see header note #3).
--    Guarded so re-running this file doesn't double the replay.
-- ═══════════════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-PG-SEED') THEN

  -- orders_require_phone_verification (082_phone_verification_checkout_guards.sql)
  -- lets service_role bypass the auth.uid()/phone-verified checks; migrations
  -- run without a PostgREST JWT context, so auth.jwt() is otherwise empty.
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
        (p_kapitan_set, v_v_kapitan, o_kapitan_komtar, 'Nasi Kandar Set', 12.90::numeric, false, 2),
        (p_kapitan_rendang, v_v_kapitan, o_kapitan_gurney, 'Beef Rendang Rice', 14.50::numeric, false, 2),
        (p_kapitan_teh, v_v_kapitan, o_kapitan_jetty, 'Teh Tarik', 3.50::numeric, false, 2),
        (p_kapitan_cendol, v_v_kapitan, o_kapitan_bf, 'Durian Cendol', 8.90::numeric, false, 2),
        (p_ckt_main, v_v_ckt, o_ckt_carnarvon, 'Char Koay Teow', 9.00::numeric, false, 2),
        (p_ckt_curry_mee, v_v_ckt, o_ckt_new_lane, 'Curry Mee', 8.50::numeric, false, 2),
        (p_ckt_cendol, v_v_ckt, o_ckt_gurney, 'Penang Cendol', 6.00::numeric, false, 2),
        (p_ckt_loh_bak, v_v_ckt, o_ckt_air_itam, 'Air Itam Loh Bak', 7.50::numeric, false, 2),
        (p_sky_kaya, v_v_sky, o_sky_armenian, 'Kaya Toast Set', 7.90::numeric, false, 2),
        (p_sky_coffee, v_v_sky, o_sky_china_street, 'Ipoh White Coffee', 5.50::numeric, false, 2),
        (p_sky_eggs, v_v_sky, o_sky_macalister, 'Half-Boiled Eggs', 4.00::numeric, false, 2),
        (p_sky_laksa, v_v_sky, o_sky_tanjung_bungah, 'Nyonya Laksa', 11.00::numeric, false, 2),
        (p_bfs_stingray, v_v_bfseafood, o_bfs_main, 'Grilled Stingray', 22.00::numeric, false, 2),
        (p_bfs_prawns, v_v_bfseafood, o_bfs_jetty, 'Salted Egg Prawns', 26.00::numeric, false, 2),
        (p_bfs_squid, v_v_bfseafood, o_bfs_tanjung_bungah, 'Butter Squid', 24.00::numeric, false, 2),
        (p_bfs_crab, v_v_bfseafood, o_bfs_teluk_bahang, 'Chilli Crab Feast', 68.00::numeric, false, 2),
        (p_op_kls_entry, v_v_op_kls, o_op_kls, 'Kek Lok Si Temple Entry', 0.00::numeric, true, 2),
        (p_op_hill_ticket, v_v_op_hill, o_op_hill, 'Penang Hill Funicular Ticket', 30.00::numeric, true, 2),
        (p_op_hill_skywalk, v_v_op_hill, o_op_hill, 'Penang Hill Skywalk Add-on', 5.00::numeric, true, 2),
        (p_op_khoo_entry, v_v_op_khoo, o_op_khoo, 'Khoo Kongsi Clan Temple Entry', 15.00::numeric, true, 2),
        (p_op_peranakan_entry, v_v_op_peranakan, o_op_peranakan, 'Pinang Peranakan Mansion Entry', 25.00::numeric, true, 2),
        (p_accom_heritage_room, v_v_heritage_row, o_heritage_row, 'Deluxe Heritage Room', 180.00::numeric, true, 1),
        (p_accom_sea_view, v_v_bf_resort, o_bf_resort, 'Sea View Room', 250.00::numeric, true, 1),
        (p_accom_homestay_1, v_v_homestay, o_homestay_1, 'Homestay Room', 90.00::numeric, true, 1),
        (p_accom_homestay_2, v_v_homestay, o_homestay_2, 'Family Homestay Room', 150.00::numeric, true, 1),
        (p_batik_sarong, v_v_batik, o_batik, 'Batik Sarong', 45.00::numeric, false, 1),
        (p_batik_keychain, v_v_batik, o_batik, 'Songket Keychain Set', 12.00::numeric, false, 1),
        (p_spice_mix, v_v_spice, o_spice, 'Penang Spice Mix Gift Set', 28.00::numeric, false, 1),
        (p_spice_tea, v_v_spice, o_spice, 'Nyonya Tea Set', 38.00::numeric, false, 1),
        (p_book_postcards, v_v_bookshop, o_bookshop, 'George Town Postcard Set', 15.00::numeric, false, 1),
        (p_book_photobook, v_v_bookshop, o_bookshop, 'Penang Heritage Photobook', 55.00::numeric, false, 1)
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
          UPDATE orders SET display_id = 'ORD-PG-SEED' WHERE id = v_order_id;
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
