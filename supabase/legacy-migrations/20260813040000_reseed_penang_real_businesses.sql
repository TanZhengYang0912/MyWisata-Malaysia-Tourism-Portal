-- Penang catalogue reseed — every vendor, outlet and product is a real,
-- verifiable business. See
-- docs/plans/2026-08-13-1109-penang-real-business-reseed.md Task 3.
--
-- Replaces the fabricated Phase 3 seed ("Sky Coffee House", "Batu Ferringhi
-- Seafood Grill", a four-stall "Auntie Gaik Lean's Char Koay Teow" chain that
-- does not exist). Names, addresses and published prices are sourced in the
-- plan's "Sourced Reference Data" section; every coordinate is an
-- OpenStreetMap Nominatim result from 2026-08-13.
--
-- Prices are MyKad / Malaysian resident rates.
--
-- The four operator vendor keys are reused verbatim so places.managed_by_vendor_id
-- resolves to the same UUIDs after the reseed. They are still NULLed before the
-- vendor DELETE and restored after the INSERT, because the delete runs first.

BEGIN;

-- Targets ONLY wallet_transactions_append_only (an untracked live trigger,
-- function wallet_transactions_are_append_only, not in any repo migration,
-- that unconditionally RAISE EXCEPTIONs on UPDATE/DELETE). It blocks the
-- DELETE FROM orders cascade (ON DELETE SET NULL onto
-- wallet_transactions.order_id) and the direct DELETE FROM wallet_transactions
-- below. Re-enabled immediately after the wallet-related wipe, before COMMIT —
-- ALTER TABLE ... DISABLE TRIGGER is a catalog change that persists past
-- COMMIT unless explicitly reversed, unlike a session-scoped setting.
--
-- A prior version of this migration used `SET LOCAL session_replication_role
-- = replica`, which disables ALL triggers for the session, not just this one
-- — including set_outlet_display_id/set_product_display_id, which caused a
-- NOT NULL violation on outlets.display_id. This targeted disable avoids that.
ALTER TABLE wallet_transactions DISABLE TRIGGER wallet_transactions_append_only;
-- Same pattern, same reason: payout_provider_events also carries an
-- append-only guard, and its RESTRICT FK onto withdrawal_requests means the
-- wipe cannot proceed without clearing it first. (A catalogue-wide survey
-- found four append-only tables; audit_logs and admin_conduct_flags are not
-- in the wipe list, so their guards stay untouched.)
ALTER TABLE payout_provider_events DISABLE TRIGGER payout_provider_events_append_only;

-- ── Wipe ────────────────────────────────────────────────────────────────
-- Same topological order as 20260812220000_reset_catalogue_and_commerce.sql,
-- plus product_places (added after that file was written) and the
-- places.managed_by_vendor_id release.

UPDATE places SET managed_by_vendor_id = NULL WHERE managed_by_vendor_id IS NOT NULL;

DELETE FROM user_roles WHERE outlet_id IS NOT NULL OR vendor_id IS NOT NULL;
DELETE FROM chat_threads;
UPDATE share_events SET affiliate_id = NULL WHERE affiliate_id IS NOT NULL;

DELETE FROM reviews;
DELETE FROM bookings;
DELETE FROM refunds;
DELETE FROM affiliate_attributions;
DELETE FROM recommendation_commissions;
DELETE FROM recommendation_conversions;
DELETE FROM payments;
DELETE FROM voucher_redemptions;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM affiliate_clicks;
DELETE FROM affiliate_fraud_flags;
DELETE FROM affiliate_links;
DELETE FROM payout_transactions;
DELETE FROM wallet_adjustments;
DELETE FROM wallet_transactions;
-- Postdates 20260812220000_reset_catalogue_and_commerce.sql, same as the
-- append-only trigger above — a leaf table with no dependents of its own, but
-- its RESTRICT FK onto withdrawal_requests blocks the next DELETE otherwise.
DELETE FROM payout_provider_events;
DELETE FROM withdrawal_requests;
DELETE FROM payout_destinations;
DELETE FROM wallet_ledger;
DELETE FROM wallets;
DELETE FROM payment_events;
DELETE FROM voucher_holds;
DELETE FROM voucher_events;
DELETE FROM checkout_wallet_reservations;
DELETE FROM checkout_reservations;
DELETE FROM checkout_sessions;
DELETE FROM cart_items;
DELETE FROM carts;
DELETE FROM digital_entitlements;
DELETE FROM content_reviews;
DELETE FROM user_interactions;
DELETE FROM recommendation_snapshots;
DELETE FROM monthly_payout_reports;
DELETE FROM withdrawal_approvals;
DELETE FROM withdrawal_risk_assessments;
DELETE FROM wallet_moderation_attempts;

-- Re-enable now — every wallet_transactions-touching DELETE above is done,
-- and Section 8 of this migration inserts new wallet_transactions rows the
-- normal way (append-only, no bypass needed for INSERT).
ALTER TABLE wallet_transactions ENABLE TRIGGER wallet_transactions_append_only;
ALTER TABLE payout_provider_events ENABLE TRIGGER payout_provider_events_append_only;

DELETE FROM customer_wishlists;
DELETE FROM customer_saved_destinations;
DELETE FROM outlet_offers;
DELETE FROM inventory;
DELETE FROM booking_slots;
DELETE FROM price_rules;
DELETE FROM product_variants;
DELETE FROM vouchers;
DELETE FROM vendor_voucher_csv_drafts;
DELETE FROM product_places;
DELETE FROM products;
DELETE FROM outlet_pages;
DELETE FROM outlet_manager_invitations;
DELETE FROM outlet_managers;
DELETE FROM outlets;
DELETE FROM vendor_documents;
DELETE FROM vendor_onboarding_profiles;
DELETE FROM vendor_recommendation_claims;
DELETE FROM vendor_recommendation_invites;
DELETE FROM vendor_recommendations;
DELETE FROM vendors;

DO $$
DECLARE
  -- places (already seeded; referenced, never inserted)
  v_p_armenian uuid := md5('penang:place:armenian-street-murals')::uuid;
  v_p_chew_jetty uuid := md5('penang:place:chew-jetty')::uuid;
  v_p_khoo_kongsi uuid := md5('penang:place:khoo-kongsi')::uuid;
  v_p_peranakan uuid := md5('penang:place:pinang-peranakan-mansion')::uuid;
  v_p_kek_lok_si uuid := md5('penang:place:kek-lok-si-temple')::uuid;
  v_p_penang_hill uuid := md5('penang:place:penang-hill')::uuid;
  v_p_monkey_beach uuid := md5('penang:place:monkey-beach-trail')::uuid;
  v_p_meromictic uuid := md5('penang:place:meromictic-lake')::uuid;

  -- vendors
  v_hameediyah uuid := md5('penang:vendor:food-hameediyah')::uuid;
  v_chendul uuid := md5('penang:vendor:food-penang-road-chendul')::uuid;
  v_toh_soon uuid := md5('penang:vendor:food-toh-soon-cafe')::uuid;
  v_line_clear uuid := md5('penang:vendor:food-line-clear')::uuid;
  v_habitat uuid := md5('penang:vendor:activity-the-habitat')::uuid;
  v_entopia uuid := md5('penang:vendor:activity-entopia')::uuid;
  v_spice_garden uuid := md5('penang:vendor:activity-tropical-spice-garden')::uuid;
  v_escape uuid := md5('penang:vendor:activity-escape-penang')::uuid;
  v_pnp uuid := md5('penang:vendor:activity-penang-national-park')::uuid;
  v_pht uuid := md5('penang:vendor:activity-penang-heritage-trust')::uuid;
  -- operator keys reused verbatim from the Phase 3 seed
  v_op_kls uuid := md5('penang:vendor:op-kek-lok-si')::uuid;
  v_op_hill uuid := md5('penang:vendor:op-penang-hill')::uuid;
  v_op_khoo uuid := md5('penang:vendor:op-khoo-kongsi')::uuid;
  v_op_peranakan uuid := md5('penang:vendor:op-peranakan-mansion')::uuid;
  v_eo uuid := md5('penang:vendor:accom-eastern-oriental')::uuid;
  v_blue_mansion uuid := md5('penang:vendor:accom-blue-mansion')::uuid;
  v_rasa_sayang uuid := md5('penang:vendor:accom-rasa-sayang')::uuid;
  v_ghee_hiang uuid := md5('penang:vendor:retail-ghee-hiang')::uuid;
  v_him_heang uuid := md5('penang:vendor:retail-him-heang')::uuid;
  v_gerakbudaya uuid := md5('penang:vendor:retail-gerakbudaya')::uuid;

  -- demo owners (existing users, preserved by the wipe above)
  v_owner_ali uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_owner_raj uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  v_owner_siti uuid := 'aaaaaaaa-0000-0000-0000-000000000009';
  v_role_vendor_owner int := 3;

  -- categories
  c_food uuid; c_activity uuid; c_accommodation uuid; c_retail uuid;

  -- outlets
  o_hameediyah uuid := md5('penang:outlet:hameediyah-campbell')::uuid;
  o_hameediyah_annexe uuid := md5('penang:outlet:hameediyah-campbell-annexe')::uuid;
  o_chendul_keng_kwee uuid := md5('penang:outlet:chendul-keng-kwee')::uuid;
  o_chendul_gurney uuid := md5('penang:outlet:chendul-gurney-plaza')::uuid;
  o_chendul_queensbay uuid := md5('penang:outlet:chendul-queensbay')::uuid;
  o_chendul_carnival uuid := md5('penang:outlet:chendul-sunway-carnival')::uuid;
  o_toh_soon uuid := md5('penang:outlet:toh-soon-campbell')::uuid;
  o_line_clear uuid := md5('penang:outlet:line-clear-jalan-penang')::uuid;
  o_habitat uuid := md5('penang:outlet:habitat-penang-hill')::uuid;
  o_entopia uuid := md5('penang:outlet:entopia-teluk-bahang')::uuid;
  o_spice_garden uuid := md5('penang:outlet:spice-garden-teluk-bahang')::uuid;
  o_escape uuid := md5('penang:outlet:escape-teluk-bahang')::uuid;
  o_pnp uuid := md5('penang:outlet:pnp-office-teluk-bahang')::uuid;
  o_pht uuid := md5('penang:outlet:pht-lebuh-gereja')::uuid;
  o_op_kls uuid := md5('penang:outlet:op-kek-lok-si')::uuid;
  o_op_hill uuid := md5('penang:outlet:op-penang-hill')::uuid;
  o_op_khoo uuid := md5('penang:outlet:op-khoo-kongsi')::uuid;
  o_op_peranakan uuid := md5('penang:outlet:op-peranakan-mansion')::uuid;
  o_eo uuid := md5('penang:outlet:eo-farquhar')::uuid;
  o_blue_mansion uuid := md5('penang:outlet:blue-mansion-leith')::uuid;
  o_rasa_sayang uuid := md5('penang:outlet:rasa-sayang-batu-ferringhi')::uuid;
  o_ghee_macalister uuid := md5('penang:outlet:ghee-hiang-macalister')::uuid;
  o_ghee_burma uuid := md5('penang:outlet:ghee-hiang-burma')::uuid;
  o_ghee_beach uuid := md5('penang:outlet:ghee-hiang-beach')::uuid;
  o_ghee_sunshine uuid := md5('penang:outlet:ghee-hiang-sunshine-central')::uuid;
  o_him_heang uuid := md5('penang:outlet:him-heang-burma')::uuid;
  o_gerakbudaya uuid := md5('penang:outlet:gerakbudaya-lebuh-pantai')::uuid;

  -- products
  p_ham_murtabak uuid := md5('penang:product:hameediyah-chicken-murtabak')::uuid;
  p_ham_ayam uuid := md5('penang:product:hameediyah-nasi-kandar-ayam-goreng')::uuid;
  p_ham_kambing uuid := md5('penang:product:hameediyah-kari-kambing')::uuid;
  p_ham_teh uuid := md5('penang:product:hameediyah-teh-tarik')::uuid;
  p_chendul_bowl uuid := md5('penang:product:chendul-penang-chendul')::uuid;
  p_chendul_kacang uuid := md5('penang:product:chendul-ice-kacang')::uuid;
  p_chendul_rojak uuid := md5('penang:product:chendul-penang-rojak')::uuid;
  p_toh_kaya uuid := md5('penang:product:toh-soon-charcoal-kaya-toast')::uuid;
  p_toh_eggs uuid := md5('penang:product:toh-soon-half-boiled-eggs')::uuid;
  p_toh_kopi uuid := md5('penang:product:toh-soon-hainanese-kopi')::uuid;
  p_lc_fish uuid := md5('penang:product:line-clear-fish-head-curry')::uuid;
  p_lc_chicken uuid := md5('penang:product:line-clear-fried-chicken')::uuid;
  p_lc_sotong uuid := md5('penang:product:line-clear-sotong-curry')::uuid;

  p_hab_trail uuid := md5('penang:product:habitat-nature-trail-ticket')::uuid;
  p_hab_curtis uuid := md5('penang:product:habitat-curtis-crest-treetop-walk')::uuid;
  p_ent_entry uuid := md5('penang:product:entopia-admission')::uuid;
  p_ent_tour uuid := md5('penang:product:entopia-guided-discovery-tour')::uuid;
  p_tsg_entry uuid := md5('penang:product:spice-garden-entry')::uuid;
  p_tsg_tour uuid := md5('penang:product:spice-garden-guided-spice-tour')::uuid;
  p_esc_pass uuid := md5('penang:product:escape-day-pass')::uuid;
  p_pnp_trek uuid := md5('penang:product:pnp-monkey-beach-jungle-trail')::uuid;
  p_pnp_boat uuid := md5('penang:product:pnp-monkey-beach-boat-transfer')::uuid;
  p_pnp_lake uuid := md5('penang:product:pnp-meromictic-lake-walk')::uuid;
  p_pht_gt uuid := md5('penang:product:pht-george-town-heritage-walk')::uuid;
  p_pht_jetty uuid := md5('penang:product:pht-clan-jetty-heritage-walk')::uuid;

  p_kls_entry uuid := md5('penang:product:kek-lok-si-entry')::uuid;
  p_kls_lift uuid := md5('penang:product:kek-lok-si-inclined-lift')::uuid;
  p_kls_pagoda uuid := md5('penang:product:kek-lok-si-pagoda')::uuid;
  p_hill_return uuid := md5('penang:product:penang-hill-funicular-return')::uuid;
  p_hill_express uuid := md5('penang:product:penang-hill-express-return')::uuid;
  p_hill_sunrise uuid := md5('penang:product:penang-hill-sunrise-ticket')::uuid;
  p_khoo_entry uuid := md5('penang:product:khoo-kongsi-entry')::uuid;
  p_per_entry uuid := md5('penang:product:peranakan-mansion-entry')::uuid;

  p_eo_heritage uuid := md5('penang:product:eo-heritage-wing-suite')::uuid;
  p_eo_victory uuid := md5('penang:product:eo-victory-annexe-suite')::uuid;
  p_bm_courtyard uuid := md5('penang:product:blue-mansion-courtyard-room')::uuid;
  p_bm_suite uuid := md5('penang:product:blue-mansion-cheong-fatt-tze-suite')::uuid;
  p_bm_tour uuid := md5('penang:product:blue-mansion-guided-tour')::uuid;
  p_rs_garden uuid := md5('penang:product:rasa-sayang-garden-wing-sea-view')::uuid;
  p_rs_premier uuid := md5('penang:product:rasa-sayang-rasa-wing-premier')::uuid;

  p_gh_tausar uuid := md5('penang:product:ghee-hiang-tau-sar-pneah')::uuid;
  p_gh_heong uuid := md5('penang:product:ghee-hiang-heong-pneah')::uuid;
  p_gh_oil uuid := md5('penang:product:ghee-hiang-sesame-oil-640ml')::uuid;
  p_hh_tausar uuid := md5('penang:product:him-heang-tau-sar-pneah')::uuid;
  p_gb_reader uuid := md5('penang:product:gerakbudaya-penang-historical-reader')::uuid;
  p_gb_postcards uuid := md5('penang:product:gerakbudaya-george-town-postcards')::uuid;

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
    (v_hameediyah, v_owner_ali, 'Hameediyah Restaurant', 'hameediyah-restaurant', 'Malaysia''s oldest nasi kandar restaurant, on Lebuh Campbell since 1907.', 'food', 'approved', now()),
    (v_chendul, v_owner_raj, 'Penang Road Famous Teochew Chendul', 'penang-road-famous-teochew-chendul', 'Shaved-ice chendul from a Lebuh Keng Kwee pushcart, trading since 1936.', 'food', 'approved', now()),
    (v_toh_soon, v_owner_siti, 'Toh Soon Cafe', 'toh-soon-cafe', 'Charcoal-toasted bread and Hainanese kopi in an alley off Lebuh Campbell.', 'food', 'approved', now()),
    (v_line_clear, v_owner_ali, 'Nasi Kandar Line Clear', 'nasi-kandar-line-clear', 'Round-the-clock nasi kandar in the alleyway off Jalan Penang.', 'food', 'approved', now()),

    (v_habitat, v_owner_raj, 'The Habitat Penang Hill', 'the-habitat-penang-hill', 'Rainforest discovery centre and canopy walk at the Penang Hill summit.', 'activity', 'approved', now()),
    (v_entopia, v_owner_siti, 'Entopia by Penang Butterfly Farm', 'entopia-penang-butterfly-farm', 'Butterfly and insect sanctuary on Jalan Teluk Bahang.', 'activity', 'approved', now()),
    (v_spice_garden, v_owner_ali, 'Tropical Spice Garden', 'tropical-spice-garden', 'Terraced spice garden and cooking school on the Teluk Bahang coast road.', 'activity', 'approved', now()),
    (v_escape, v_owner_raj, 'ESCAPE Penang', 'escape-penang', 'Outdoor adventure and water park on Jalan Teluk Bahang.', 'activity', 'approved', now()),
    (v_pnp, v_owner_siti, 'Penang National Park', 'penang-national-park', 'Taman Negara Pulau Pinang — trail registration and guided jungle walks.', 'activity', 'approved', now()),
    (v_pht, v_owner_ali, 'Penang Heritage Trust', 'penang-heritage-trust', 'Heritage walking tours of the George Town UNESCO core zone.', 'activity', 'approved', now()),

    (v_op_kls, v_owner_raj, 'Kek Lok Si Temple', 'kek-lok-si-temple-vendor', 'Operator of the Kek Lok Si Temple complex in Ayer Itam.', 'attraction', 'approved', now()),
    (v_op_hill, v_owner_siti, 'Penang Hill Corporation', 'penang-hill-corporation', 'Operator of the Penang Hill funicular railway.', 'attraction', 'approved', now()),
    (v_op_khoo, v_owner_ali, 'Leong San Tong Khoo Kongsi', 'khoo-kongsi-trust', 'Custodian of the Khoo Kongsi clan temple at Medan Cannon.', 'attraction', 'approved', now()),
    (v_op_peranakan, v_owner_raj, 'Pinang Peranakan Mansion', 'pinang-peranakan-mansion-vendor', 'Operator of the Pinang Peranakan Mansion museum on Lebuh Gereja.', 'attraction', 'approved', now()),

    (v_eo, v_owner_siti, 'Eastern & Oriental Hotel', 'eastern-oriental-hotel', 'Seafront colonial hotel on Lebuh Farquhar, established 1885.', 'accommodation', 'approved', now()),
    (v_blue_mansion, v_owner_ali, 'Cheong Fatt Tze — The Blue Mansion', 'cheong-fatt-tze-blue-mansion', 'Restored indigo courtyard mansion on Lebuh Leith; rooms and guided tours.', 'accommodation', 'approved', now()),
    (v_rasa_sayang, v_owner_raj, 'Shangri-La Rasa Sayang Resort & Spa', 'shangri-la-rasa-sayang', 'Beachfront resort on Jalan Batu Feringgi.', 'accommodation', 'approved', now()),

    (v_ghee_hiang, v_owner_siti, 'Ghee Hiang', 'ghee-hiang', 'Tau sar pneah and pure sesame oil, made in Penang since 1856.', 'retail', 'approved', now()),
    (v_him_heang, v_owner_ali, 'Him Heang', 'him-heang', 'Jalan Burma tau sar pneah bakery, established 1948.', 'retail', 'approved', now()),
    (v_gerakbudaya, v_owner_raj, 'Gerakbudaya Bookshop', 'gerakbudaya-bookshop-penang', 'Independent bookshop on Lebuh Pantai specialising in Malaysian history.', 'retail', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_roles (user_id, role_id, vendor_id)
  SELECT v.owner_id, v_role_vendor_owner, v.id FROM vendors v
  ON CONFLICT (user_id, role_id, vendor_id, outlet_id) DO NOTHING;

  -- Restore the operator links released before the vendor DELETE.
  UPDATE places SET managed_by_vendor_id = v_op_kls WHERE id = v_p_kek_lok_si;
  UPDATE places SET managed_by_vendor_id = v_op_hill WHERE id = v_p_penang_hill;
  UPDATE places SET managed_by_vendor_id = v_op_khoo WHERE id = v_p_khoo_kongsi;
  UPDATE places SET managed_by_vendor_id = v_op_peranakan WHERE id = v_p_peranakan;

  INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng)
  VALUES
    (o_hameediyah, v_hameediyah, 'Hameediyah — Lebuh Campbell', 'hameediyah-campbell', '164A Lebuh Campbell', 'George Town', 'Penang', 5.418554, 100.332652),
    (o_hameediyah_annexe, v_hameediyah, 'Hameediyah — Campbell Annexe', 'hameediyah-campbell-annexe', 'Lebuh Campbell (air-conditioned annexe)', 'George Town', 'Penang', 5.418554, 100.332652),

    (o_chendul_keng_kwee, v_chendul, 'Penang Road Famous Teochew Chendul — Lebuh Keng Kwee', 'chendul-keng-kwee', '27 & 29 Lebuh Keng Kwee', 'George Town', 'Penang', 5.417140, 100.330674),
    (o_chendul_gurney, v_chendul, 'Penang Road Famous Teochew Chendul — Gurney Plaza', 'chendul-gurney-plaza', 'Lot 170-04-43A, 4th Floor, Gurney Plaza, 170 Persiaran Gurney', 'George Town', 'Penang', 5.437297, 100.309403),
    (o_chendul_queensbay, v_chendul, 'Penang Road Famous Teochew Chendul — Queensbay Mall', 'chendul-queensbay', 'Lot 3F-05 (10), 3rd Floor, Queensbay Mall, Persiaran Bayan Indah', 'Bayan Lepas', 'Penang', 5.333272, 100.306517),
    (o_chendul_carnival, v_chendul, 'Penang Road Famous Teochew Chendul — Sunway Carnival', 'chendul-sunway-carnival', 'LG-32 & 33, Sunway Carnival Mall, Jalan Todak', 'Seberang Jaya', 'Penang', 5.399234, 100.398163),

    (o_toh_soon, v_toh_soon, 'Toh Soon Cafe', 'toh-soon-campbell', '184 Lebuh Campbell', 'George Town', 'Penang', 5.418828, 100.332093),
    (o_line_clear, v_line_clear, 'Nasi Kandar Line Clear', 'line-clear-jalan-penang', '177 Jalan Penang', 'George Town', 'Penang', 5.419586, 100.332526),

    (o_habitat, v_habitat, 'The Habitat Penang Hill', 'habitat-penang-hill', 'Jalan Bukit Bendera, Penang Hill', 'Ayer Itam', 'Penang', 5.422785, 100.265224),
    (o_entopia, v_entopia, 'Entopia by Penang Butterfly Farm', 'entopia-teluk-bahang', '830 Jalan Teluk Bahang', 'Teluk Bahang', 'Penang', 5.447506, 100.215235),
    (o_spice_garden, v_spice_garden, 'Tropical Spice Garden', 'spice-garden-teluk-bahang', 'Lot 595 Mukim 2, Jalan Teluk Bahang', 'Teluk Bahang', 'Penang', 5.463476, 100.229108),
    (o_escape, v_escape, 'ESCAPE Penang', 'escape-teluk-bahang', '828 Jalan Teluk Bahang', 'Teluk Bahang', 'Penang', 5.448652, 100.216632),
    (o_pnp, v_pnp, 'Penang National Park — Park Office', 'pnp-office-teluk-bahang', 'Jalan Hassan Abas, Taman Negara Pulau Pinang', 'Teluk Bahang', 'Penang', 5.459765, 100.206004),
    (o_pht, v_pht, 'Penang Heritage Trust — Lebuh Gereja', 'pht-lebuh-gereja', '26 Lebuh Gereja', 'George Town', 'Penang', 5.418049, 100.341552),

    (o_op_kls, v_op_kls, 'Kek Lok Si Temple — Main Entrance', 'op-kek-lok-si', 'Kek Lok Si, Jalan Balik Pulau', 'Ayer Itam', 'Penang', 5.399721, 100.273889),
    (o_op_hill, v_op_hill, 'Penang Hill — Lower Station', 'op-penang-hill', 'Jalan Stesen Bukit Bendera', 'Ayer Itam', 'Penang', 5.408263, 100.277340),
    (o_op_khoo, v_op_khoo, 'Khoo Kongsi — Ticket Counter', 'op-khoo-kongsi', '18 Medan Cannon', 'George Town', 'Penang', 5.414265, 100.337592),
    (o_op_peranakan, v_op_peranakan, 'Pinang Peranakan Mansion — Front Desk', 'op-peranakan-mansion', '29 Lebuh Gereja', 'George Town', 'Penang', 5.417792, 100.341129),

    (o_eo, v_eo, 'Eastern & Oriental Hotel', 'eo-farquhar', '10 Lebuh Farquhar', 'George Town', 'Penang', 5.423464, 100.335560),
    (o_blue_mansion, v_blue_mansion, 'Cheong Fatt Tze — The Blue Mansion', 'blue-mansion-leith', '14 Lebuh Leith', 'George Town', 'Penang', 5.421518, 100.334767),
    (o_rasa_sayang, v_rasa_sayang, 'Shangri-La Rasa Sayang Resort & Spa', 'rasa-sayang-batu-ferringhi', 'Jalan Batu Feringgi', 'Batu Ferringhi', 'Penang', 5.478984, 100.254280),

    (o_ghee_macalister, v_ghee_hiang, 'Ghee Hiang — Jalan Macalister', 'ghee-hiang-macalister', '216 Jalan Macalister', 'George Town', 'Penang', 5.420740, 100.315412),
    (o_ghee_burma, v_ghee_hiang, 'Ghee Hiang — Jalan Burma', 'ghee-hiang-burma', '144 G & H Jalan Burma', 'George Town', 'Penang', 5.422929, 100.322059),
    (o_ghee_beach, v_ghee_hiang, 'Ghee Hiang — Lebuh Pantai', 'ghee-hiang-beach', '95 Lebuh Pantai', 'George Town', 'Penang', 5.415406, 100.340084),
    (o_ghee_sunshine, v_ghee_hiang, 'Ghee Hiang — Sunshine Central', 'ghee-hiang-sunshine-central', 'Lot 1-38, Level 1, Sunshine Mall, Jalan Thean Teik', 'Ayer Itam', 'Penang', 5.398330, 100.286612),

    (o_him_heang, v_him_heang, 'Him Heang', 'him-heang-burma', '162A Jalan Burma', 'George Town', 'Penang', 5.424152, 100.321415),
    (o_gerakbudaya, v_gerakbudaya, 'Gerakbudaya Bookshop', 'gerakbudaya-lebuh-pantai', '226 Lebuh Pantai', 'George Town', 'Penang', 5.418704, 100.343682)
  ON CONFLICT (id) DO NOTHING;

  -- 5a. Food — vendor-wide (outlet_id NULL, reachable via outlet_offers)
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_ham_murtabak, v_hameediyah, NULL, c_food, 'Chicken Murtabak', 'hameediyah-chicken-murtabak', 'Griddled stuffed roti with spiced chicken and egg — the 1907 signature.', 'food', false, 12.00),
    (p_ham_ayam, v_hameediyah, NULL, c_food, 'Nasi Kandar Ayam Goreng', 'hameediyah-nasi-kandar-ayam-goreng', 'Rice with fried chicken and a ladle of mixed curry.', 'food', false, 11.00),
    (p_ham_kambing, v_hameediyah, NULL, c_food, 'Kari Kambing', 'hameediyah-kari-kambing', 'Slow-cooked mutton curry over rice.', 'food', false, 14.00),
    (p_ham_teh, v_hameediyah, NULL, c_food, 'Teh Tarik', 'hameediyah-teh-tarik', 'Hand-pulled milk tea.', 'food', false, 3.00),
    (p_chendul_bowl, v_chendul, NULL, c_food, 'Penang Chendul', 'chendul-penang-chendul', 'Shaved ice with pandan noodles, gula melaka and coconut milk.', 'food', false, 4.50),
    (p_chendul_kacang, v_chendul, NULL, c_food, 'Ice Kacang', 'chendul-ice-kacang', 'Shaved ice with red beans, sweetcorn and rose syrup.', 'food', false, 5.50),
    (p_gh_tausar, v_ghee_hiang, NULL, c_retail, 'Tau Sar Pneah (Box of 20)', 'ghee-hiang-tau-sar-pneah', 'Flaky mung bean pastries, baked in Penang since 1856.', 'product', false, 15.50),
    (p_gh_heong, v_ghee_hiang, NULL, c_retail, 'Heong Pneah (Box of 12)', 'ghee-hiang-heong-pneah', 'Fragrant baked pastry with a malt-sugar centre.', 'product', false, 16.50),
    (p_gh_oil, v_ghee_hiang, NULL, c_retail, 'Pure Sesame Oil 640ml', 'ghee-hiang-sesame-oil-640ml', 'Stone-milled pure white sesame oil.', 'product', false, 48.00)
  ON CONFLICT (id) DO NOTHING;

  -- 5b. Outlet-specific products
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_chendul_rojak, v_chendul, o_chendul_keng_kwee, c_food, 'Penang Rojak', 'chendul-penang-rojak', 'Fruit rojak in prawn paste, sold at the Lebuh Keng Kwee stall only.', 'food', false, 7.00),
    (p_toh_kaya, v_toh_soon, o_toh_soon, c_food, 'Charcoal-Toasted Kaya Toast', 'toh-soon-charcoal-kaya-toast', 'Bread toasted over charcoal, thick kaya and cold butter.', 'food', false, 3.50),
    (p_toh_eggs, v_toh_soon, o_toh_soon, c_food, 'Half-Boiled Kampung Eggs', 'toh-soon-half-boiled-eggs', 'Two kampung eggs with dark soy and white pepper.', 'food', false, 3.00),
    (p_toh_kopi, v_toh_soon, o_toh_soon, c_food, 'Hainanese Kopi', 'toh-soon-hainanese-kopi', 'Wok-roasted coffee, brewed through a sock filter.', 'food', false, 2.80),
    (p_lc_fish, v_line_clear, o_line_clear, c_food, 'Fish Head Curry Rice', 'line-clear-fish-head-curry', 'Whole fish head in nasi kandar curry, served over rice.', 'food', false, 22.00),
    (p_lc_chicken, v_line_clear, o_line_clear, c_food, 'Fried Chicken Rice', 'line-clear-fried-chicken', 'Fried chicken with mixed curry ladled over rice.', 'food', false, 13.00),
    (p_lc_sotong, v_line_clear, o_line_clear, c_food, 'Sotong Curry Rice', 'line-clear-sotong-curry', 'Squid curry over rice.', 'food', false, 15.00),

    (p_hab_trail, v_habitat, o_habitat, c_activity, 'The Habitat Nature Trail Ticket', 'habitat-nature-trail-ticket', 'Self-guided access to the rainforest trail and canopy walk.', 'activity', true, 50.00),
    (p_hab_curtis, v_habitat, o_habitat, c_activity, 'Curtis Crest Treetop Walk', 'habitat-curtis-crest-treetop-walk', 'Add-on access to the 360-degree treetop viewing platform.', 'activity', true, 20.00),
    (p_ent_entry, v_entopia, o_entopia, c_activity, 'Entopia Admission', 'entopia-admission', 'Entry to the Natureland dome and Cocoon indoor discovery centre.', 'activity', true, 65.00),
    (p_ent_tour, v_entopia, o_entopia, c_activity, 'Entopia Guided Discovery Tour', 'entopia-guided-discovery-tour', 'Naturalist-led tour of the butterfly and insect habitats.', 'experience', true, 85.00),
    (p_tsg_entry, v_spice_garden, o_spice_garden, c_activity, 'Spice Garden Entry', 'spice-garden-entry', 'Self-guided audio tour of the terraced spice gardens.', 'activity', true, 28.00),
    (p_tsg_tour, v_spice_garden, o_spice_garden, c_activity, 'Guided Spice Tour', 'spice-garden-guided-spice-tour', 'Guided walk through the spice, ornamental and jungle gardens.', 'experience', true, 38.00),
    (p_esc_pass, v_escape, o_escape, c_activity, 'Adventureplay + Waterplay Day Pass', 'escape-day-pass', 'Full-day access to both parks.', 'activity', true, 118.00),

    (p_kls_entry, v_op_kls, o_op_kls, c_activity, 'Kek Lok Si Temple Entry', 'kek-lok-si-entry', 'Free entry to the temple complex.', 'activity', true, 0.00),
    (p_kls_lift, v_op_kls, o_op_kls, c_activity, 'Inclined Lift to Kuan Yin Statue', 'kek-lok-si-inclined-lift', 'Return ride to the bronze Kuan Yin pavilion.', 'activity', true, 6.00),
    (p_kls_pagoda, v_op_kls, o_op_kls, c_activity, 'Pagoda of Ten Thousand Buddhas', 'kek-lok-si-pagoda', 'Access to the seven-tier pagoda.', 'activity', true, 2.00),
    (p_hill_return, v_op_hill, o_op_hill, c_activity, 'Funicular Return Ticket (Adult, MyKad)', 'penang-hill-funicular-return', 'Return funicular ride to the summit, normal lane.', 'activity', true, 16.00),
    (p_hill_express, v_op_hill, o_op_hill, c_activity, 'Express Lane Return Ticket (Adult, MyKad)', 'penang-hill-express-return', 'Return funicular ride with priority boarding.', 'activity', true, 40.00),
    (p_hill_sunrise, v_op_hill, o_op_hill, c_activity, 'Sunrise Ticket', 'penang-hill-sunrise-ticket', 'Return ride for Malaysian residents boarding 6:15am–8:00am.', 'activity', true, 6.00),
    (p_khoo_entry, v_op_khoo, o_op_khoo, c_activity, 'Khoo Kongsi Entry (Adult)', 'khoo-kongsi-entry', 'Entry to the clan temple, opera stage and museum.', 'activity', true, 15.00),
    (p_per_entry, v_op_peranakan, o_op_peranakan, c_activity, 'Pinang Peranakan Mansion Entry (Adult)', 'peranakan-mansion-entry', 'Entry to the mansion museum, free guided tour included.', 'activity', true, 20.00),

    (p_eo_heritage, v_eo, o_eo, c_accommodation, 'Heritage Wing Suite', 'eo-heritage-wing-suite', 'Sea-facing suite in the original 1885 wing.', 'service', true, 750.00),
    (p_eo_victory, v_eo, o_eo, c_accommodation, 'Victory Annexe Suite', 'eo-victory-annexe-suite', 'Suite in the Victory Annexe with a private balcony.', 'service', true, 620.00),
    (p_bm_courtyard, v_blue_mansion, o_blue_mansion, c_accommodation, 'Courtyard Room', 'blue-mansion-courtyard-room', 'Room opening onto the mansion''s indigo courtyard.', 'service', true, 520.00),
    (p_bm_suite, v_blue_mansion, o_blue_mansion, c_accommodation, 'Cheong Fatt Tze Suite', 'blue-mansion-cheong-fatt-tze-suite', 'The mansion''s largest suite, overlooking Lebuh Leith.', 'service', true, 780.00),
    (p_bm_tour, v_blue_mansion, o_blue_mansion, c_activity, 'Guided Mansion Tour', 'blue-mansion-guided-tour', 'Guided tour of the mansion, open to non-residents.', 'experience', true, 25.00),
    (p_rs_garden, v_rasa_sayang, o_rasa_sayang, c_accommodation, 'Garden Wing Deluxe Sea View', 'rasa-sayang-garden-wing-sea-view', 'Deluxe room facing the Straits of Malacca.', 'service', true, 880.00),
    (p_rs_premier, v_rasa_sayang, o_rasa_sayang, c_accommodation, 'Rasa Wing Premier Room', 'rasa-sayang-rasa-wing-premier', 'Rasa Wing room with club lounge access.', 'service', true, 1250.00),

    (p_hh_tausar, v_him_heang, o_him_heang, c_retail, 'Tau Sar Pneah (Box of 20)', 'him-heang-tau-sar-pneah', 'Jalan Burma mung bean pastries, baked since 1948.', 'product', false, 13.00),
    (p_gb_reader, v_gerakbudaya, o_gerakbudaya, c_retail, 'Penang: A Historical Reader', 'gerakbudaya-penang-historical-reader', 'Collected essays on Penang''s port, clans and trade.', 'product', false, 45.00),
    (p_gb_postcards, v_gerakbudaya, o_gerakbudaya, c_retail, 'George Town Postcard Set', 'gerakbudaya-george-town-postcards', 'Set of eight shophouse and street-art postcards.', 'product', false, 5.00)
  ON CONFLICT (id) DO NOTHING;

  -- 5c. Place-bound guide services — no outlet at all. This is the pattern the
  -- place model exists for: a product reachable only through product_places.
  INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, description, product_type, requires_booking, base_price)
  VALUES
    (p_pnp_trek, v_pnp, NULL, c_activity, 'Monkey Beach Jungle Trail Guide', 'pnp-monkey-beach-jungle-trail', 'Guided jungle trail from the park office to Monkey Beach.', 'experience', true, 45.00),
    (p_pnp_boat, v_pnp, NULL, c_activity, 'Monkey Beach Boat Transfer', 'pnp-monkey-beach-boat-transfer', 'Boat transfer between Teluk Bahang jetty and Monkey Beach.', 'experience', true, 40.00),
    (p_pnp_lake, v_pnp, NULL, c_activity, 'Meromictic Lake Trail Walk', 'pnp-meromictic-lake-walk', 'Guided walk to the seasonal meromictic lake at Pantai Kerachut.', 'experience', true, 35.00),
    (p_pht_gt, v_pht, NULL, c_activity, 'George Town Heritage Walking Tour', 'pht-george-town-heritage-walk', 'Guided walk through the UNESCO core zone and its street art.', 'experience', true, 60.00),
    (p_pht_jetty, v_pht, NULL, c_activity, 'Clan Jetty Heritage Walk', 'pht-clan-jetty-heritage-walk', 'Guided walk along the Weld Quay clan jetties.', 'experience', true, 60.00)
  ON CONFLICT (id) DO NOTHING;

  -- 6. outlet_offers — vendor-wide products at every outlet of their vendor
  INSERT INTO outlet_offers (product_id, outlet_id, price)
  SELECT p.id, o.id, p.base_price
  FROM products p JOIN outlets o ON o.vendor_id = p.vendor_id
  WHERE p.outlet_id IS NULL AND p.vendor_id IN (v_hameediyah, v_chendul, v_ghee_hiang)
  ON CONFLICT (product_id, outlet_id) DO NOTHING;

  -- 7. Variants — one default per accommodation and retail product, plus the
  --    breakfast upsell the hotels actually offer.
  INSERT INTO product_variants (id, product_id, name, price_offset, is_default)
  VALUES
    (md5('penang:variant:eo-heritage-room-only')::uuid, p_eo_heritage, 'Room Only', 0, true),
    (md5('penang:variant:eo-heritage-breakfast')::uuid, p_eo_heritage, 'Breakfast Included', 90, false),
    (md5('penang:variant:eo-victory-room-only')::uuid, p_eo_victory, 'Room Only', 0, true),
    (md5('penang:variant:eo-victory-breakfast')::uuid, p_eo_victory, 'Breakfast Included', 90, false),
    (md5('penang:variant:bm-courtyard-standard')::uuid, p_bm_courtyard, 'Room Only', 0, true),
    (md5('penang:variant:bm-suite-standard')::uuid, p_bm_suite, 'Room Only', 0, true),
    (md5('penang:variant:rs-garden-room-only')::uuid, p_rs_garden, 'Room Only', 0, true),
    (md5('penang:variant:rs-garden-breakfast')::uuid, p_rs_garden, 'Breakfast Included', 120, false),
    (md5('penang:variant:rs-premier-standard')::uuid, p_rs_premier, 'Club Lounge Access', 0, true),
    (md5('penang:variant:gh-tausar-standard')::uuid, p_gh_tausar, 'Box of 20', 0, true),
    (md5('penang:variant:gh-heong-standard')::uuid, p_gh_heong, 'Box of 12', 0, true),
    (md5('penang:variant:gh-oil-standard')::uuid, p_gh_oil, '640ml', 0, true),
    (md5('penang:variant:hh-tausar-standard')::uuid, p_hh_tausar, 'Box of 20', 0, true),
    (md5('penang:variant:gb-reader-standard')::uuid, p_gb_reader, 'Paperback', 0, true),
    (md5('penang:variant:gb-postcards-standard')::uuid, p_gb_postcards, 'Set of 8', 0, true)
  ON CONFLICT (id) DO NOTHING;

  -- 8. Inventory — retail only. Ghee Hiang's stock is per outlet because its
  --    products are vendor-wide (outlet_id NULL), so a single row would have a
  --    NULL outlet_id and belong to no shop floor.
  INSERT INTO inventory (variant_id, quantity, reserved, outlet_id)
  SELECT v.id, 50, 0, COALESCE(p.outlet_id, o.id)
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  LEFT JOIN outlets o ON p.outlet_id IS NULL AND o.vendor_id = p.vendor_id
  WHERE p.product_type = 'product'
  ON CONFLICT DO NOTHING;

  -- 9. product_places — the load-bearing links
  INSERT INTO product_places (product_id, place_id, relation_type)
  VALUES
    (p_kls_entry, v_p_kek_lok_si, 'admission'),
    (p_kls_lift, v_p_kek_lok_si, 'addon'),
    (p_kls_pagoda, v_p_kek_lok_si, 'addon'),
    (p_hill_return, v_p_penang_hill, 'admission'),
    (p_hill_express, v_p_penang_hill, 'addon'),
    (p_hill_sunrise, v_p_penang_hill, 'addon'),
    (p_hab_trail, v_p_penang_hill, 'addon'),
    (p_hab_curtis, v_p_penang_hill, 'addon'),
    (p_khoo_entry, v_p_khoo_kongsi, 'admission'),
    (p_per_entry, v_p_peranakan, 'admission'),
    (p_pnp_trek, v_p_monkey_beach, 'guide_service'),
    (p_pnp_boat, v_p_monkey_beach, 'addon'),
    (p_pnp_lake, v_p_meromictic, 'guide_service'),
    (p_pht_gt, v_p_armenian, 'guide_service'),
    (p_pht_jetty, v_p_chew_jetty, 'guide_service')
  ON CONFLICT (product_id, place_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM orders WHERE display_id = 'ORD-PG-REAL') THEN

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
          (p_ham_murtabak, v_hameediyah, o_hameediyah, 'Chicken Murtabak', 12.00::numeric, false, 2),
          (p_ham_ayam, v_hameediyah, o_hameediyah_annexe, 'Nasi Kandar Ayam Goreng', 11.00::numeric, false, 2),
          (p_ham_kambing, v_hameediyah, o_hameediyah, 'Kari Kambing', 14.00::numeric, false, 2),
          (p_ham_teh, v_hameediyah, o_hameediyah_annexe, 'Teh Tarik', 3.00::numeric, false, 2),
          (p_chendul_bowl, v_chendul, o_chendul_keng_kwee, 'Penang Chendul', 4.50::numeric, false, 3),
          (p_chendul_kacang, v_chendul, o_chendul_gurney, 'Ice Kacang', 5.50::numeric, false, 2),
          (p_chendul_rojak, v_chendul, o_chendul_keng_kwee, 'Penang Rojak', 7.00::numeric, false, 2),
          (p_toh_kaya, v_toh_soon, o_toh_soon, 'Charcoal-Toasted Kaya Toast', 3.50::numeric, false, 2),
          (p_toh_eggs, v_toh_soon, o_toh_soon, 'Half-Boiled Kampung Eggs', 3.00::numeric, false, 2),
          (p_toh_kopi, v_toh_soon, o_toh_soon, 'Hainanese Kopi', 2.80::numeric, false, 2),
          (p_lc_fish, v_line_clear, o_line_clear, 'Fish Head Curry Rice', 22.00::numeric, false, 2),
          (p_lc_chicken, v_line_clear, o_line_clear, 'Fried Chicken Rice', 13.00::numeric, false, 2),
          (p_lc_sotong, v_line_clear, o_line_clear, 'Sotong Curry Rice', 15.00::numeric, false, 2),
          (p_hab_trail, v_habitat, o_habitat, 'The Habitat Nature Trail Ticket', 50.00::numeric, true, 2),
          (p_hab_curtis, v_habitat, o_habitat, 'Curtis Crest Treetop Walk', 20.00::numeric, true, 2),
          (p_ent_entry, v_entopia, o_entopia, 'Entopia Admission', 65.00::numeric, true, 2),
          (p_ent_tour, v_entopia, o_entopia, 'Entopia Guided Discovery Tour', 85.00::numeric, true, 1),
          (p_tsg_entry, v_spice_garden, o_spice_garden, 'Spice Garden Entry', 28.00::numeric, true, 2),
          (p_tsg_tour, v_spice_garden, o_spice_garden, 'Guided Spice Tour', 38.00::numeric, true, 1),
          (p_esc_pass, v_escape, o_escape, 'Adventureplay + Waterplay Day Pass', 118.00::numeric, true, 2),
          (p_kls_entry, v_op_kls, o_op_kls, 'Kek Lok Si Temple Entry', 0.00::numeric, true, 2),
          (p_kls_lift, v_op_kls, o_op_kls, 'Inclined Lift to Kuan Yin Statue', 6.00::numeric, true, 2),
          (p_kls_pagoda, v_op_kls, o_op_kls, 'Pagoda of Ten Thousand Buddhas', 2.00::numeric, true, 2),
          (p_hill_return, v_op_hill, o_op_hill, 'Funicular Return Ticket (Adult, MyKad)', 16.00::numeric, true, 3),
          (p_hill_express, v_op_hill, o_op_hill, 'Express Lane Return Ticket (Adult, MyKad)', 40.00::numeric, true, 1),
          (p_hill_sunrise, v_op_hill, o_op_hill, 'Sunrise Ticket', 6.00::numeric, true, 1),
          (p_khoo_entry, v_op_khoo, o_op_khoo, 'Khoo Kongsi Entry (Adult)', 15.00::numeric, true, 2),
          (p_per_entry, v_op_peranakan, o_op_peranakan, 'Pinang Peranakan Mansion Entry (Adult)', 20.00::numeric, true, 2),
          (p_eo_heritage, v_eo, o_eo, 'Heritage Wing Suite', 750.00::numeric, true, 1),
          (p_eo_victory, v_eo, o_eo, 'Victory Annexe Suite', 620.00::numeric, true, 1),
          (p_bm_courtyard, v_blue_mansion, o_blue_mansion, 'Courtyard Room', 520.00::numeric, true, 1),
          (p_bm_suite, v_blue_mansion, o_blue_mansion, 'Cheong Fatt Tze Suite', 780.00::numeric, true, 1),
          (p_bm_tour, v_blue_mansion, o_blue_mansion, 'Guided Mansion Tour', 25.00::numeric, true, 2),
          (p_rs_garden, v_rasa_sayang, o_rasa_sayang, 'Garden Wing Deluxe Sea View', 880.00::numeric, true, 1),
          (p_rs_premier, v_rasa_sayang, o_rasa_sayang, 'Rasa Wing Premier Room', 1250.00::numeric, true, 1),
          (p_gh_tausar, v_ghee_hiang, o_ghee_macalister, 'Tau Sar Pneah (Box of 20)', 15.50::numeric, false, 2),
          (p_gh_heong, v_ghee_hiang, o_ghee_beach, 'Heong Pneah (Box of 12)', 16.50::numeric, false, 2),
          (p_gh_oil, v_ghee_hiang, o_ghee_burma, 'Pure Sesame Oil 640ml', 48.00::numeric, false, 1),
          (p_hh_tausar, v_him_heang, o_him_heang, 'Tau Sar Pneah (Box of 20)', 13.00::numeric, false, 2),
          (p_gb_reader, v_gerakbudaya, o_gerakbudaya, 'Penang: A Historical Reader', 45.00::numeric, false, 1),
          (p_gb_postcards, v_gerakbudaya, o_gerakbudaya, 'George Town Postcard Set', 5.00::numeric, false, 2)
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
            UPDATE orders SET display_id = 'ORD-PG-REAL' WHERE id = v_order_id;
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
  SELECT count(*) INTO n FROM vendors;
  IF n <> 20 THEN RAISE EXCEPTION 'expected 20 vendors, found %', n; END IF;

  SELECT count(*) INTO n FROM outlets;
  IF n <> 27 THEN RAISE EXCEPTION 'expected 27 outlets, found %', n; END IF;

  SELECT count(*) INTO n FROM products;
  IF n <> 46 THEN RAISE EXCEPTION 'expected 46 products, found %', n; END IF;

  SELECT count(*) INTO n FROM products WHERE category_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% products have no category_id', n; END IF;

  SELECT count(*) INTO n FROM places WHERE managed_by_vendor_id IS NULL
    AND slug IN ('kek-lok-si-temple', 'penang-hill', 'khoo-kongsi', 'pinang-peranakan-mansion');
  IF n > 0 THEN RAISE EXCEPTION '% operator places lost their managed_by_vendor_id', n; END IF;

  SELECT count(*) INTO n FROM product_places;
  IF n <> 15 THEN RAISE EXCEPTION 'expected 15 product_places links, found %', n; END IF;
END $$;

COMMIT;
