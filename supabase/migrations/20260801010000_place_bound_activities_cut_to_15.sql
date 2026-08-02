-- ============================================================
-- 20260801010000_place_bound_activities_cut_to_15.sql
--
-- Phase 2 of docs/plans/2026-07-31-2326-activity-place-bound-detail-pages.md
--
-- The demo seed cloned 17 product templates across 13 outlets, so
-- "Rainforest Canopy Trek" ended up listed in Seremban and "Heritage Street
-- Food Trail" in six cities at once. A canopy trek is a place, not a chain
-- store: this cuts the nature/cultural/adventure catalogue from 55 rows to 15
-- real, place-specific activities.
--
-- Nothing is thrown away. Every order line, review and booking slot belonging
-- to a removed clone is REPOINTED onto a surviving activity of the SAME VENDOR
-- in the nearest surviving city (decision D7) before the delete, so vendor
-- revenue and payout reports keep their totals and no order loses its product.
--
-- Repoint volume: 1,819 order items · 761 reviews · 173 booking slots.
--
-- APPLIED 2026-08-01. Run this file as ONE transaction (supabase db push, or
-- paste the whole thing into the SQL Editor and execute once). The TEMP table
-- below does not survive between separate SQL Editor executions — running the
-- statements piecemeal fails with 'relation "repoint" does not exist'. The
-- Phase 3 migration avoids the problem entirely by inlining its map as a CTE.
-- ============================================================


-- ── 0. Survivors need a variant before they can receive order lines ─────────
-- The five hand-authored place-specific activities (Bako, Kinta Valley, Mount
-- Kinabalu, Setiu, Gunung Tapis) were inserted straight into the live DB and
-- never got a product_variants row. That also makes them unbuyable today —
-- the detail page resolves variantId to "" and the cart has nothing to add.
INSERT INTO product_variants (product_id, name, price_offset, is_default, is_active, sort_order)
SELECT p.id, 'Standard', 0, TRUE, TRUE, 0
FROM products p
WHERE p.id IN (
  'c4291ea4-b07b-4106-bba0-ac1505b6c74f',  -- Bako National Park Coastal Trail
  'b60333b2-299a-4df2-8709-276c970ca4b5',  -- Gunung Tapis Waterfall Hike
  '3c951980-7957-4e12-856b-ce40959e8900',  -- Kinta Valley Limestone Hike
  '843f1aa4-f142-4e4a-984b-cdb4d93dcc5f',  -- Mount Kinabalu Foothill Trail
  '5b9edc5c-0a24-4a68-966c-c52da4a30766'   -- Setiu Wetlands Nature Walk
)
AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id);


-- ── 1. Rename the 8 survivors that keep a clone's data but need a real name ──
-- Explore Outdoors Malaysia
UPDATE products SET
  name = 'Penang National Park Monkey Beach Trek',
  slug = 'penang-national-park-monkey-beach-trek',
  description = 'Coastal jungle trek inside Penang National Park from Teluk Bahang to Monkey Beach, with a guided stop at the meromictic lake.',
  type_slugs = ARRAY['nature']
WHERE id = 'd20f5b8a-420f-4e16-a9ee-e1534e8df93a';

UPDATE products SET
  name = 'Kilim Geoforest Mangrove Kayak',
  slug = 'kilim-geoforest-mangrove-kayak',
  description = 'Paddle the limestone channels of the Kilim Karst Geoforest Park in Langkawi, past eagle roosts, bat caves and mangrove nurseries.',
  type_slugs = ARRAY['adventure']
WHERE id = 'bcf78b05-330c-46ca-a3ee-5612ee0feb6f';

UPDATE products SET
  name = 'Bukit Nanas Forest Reserve Walk',
  slug = 'bukit-nanas-forest-reserve-walk',
  description = 'Guided walk through the last patch of primary rainforest inside Kuala Lumpur, ending at the KL Tower canopy deck.',
  type_slugs = ARRAY['nature']
WHERE id = '03db72a4-dc49-4278-a44d-22e1e161b5eb';

-- Warisan Cultural Journeys
-- NOTE: the plan listed "George Town Story Walk" as already correct. It was
-- not — all six rows carrying that name sit in other cities. The George Town
-- product is renamed here instead, which is why this phase has 8 renames, not 7.
UPDATE products SET
  name = 'George Town Story Walk',
  slug = 'george-town-story-walk-penang',
  description = 'Shophouse-to-shophouse walk through George Town''s UNESCO core, tracing clan jetties, street art and Peranakan trade history.',
  type_slugs = ARRAY['cultural']
WHERE id = '93806ba3-a1db-4a28-a8c8-5798a7dea394';

UPDATE products SET
  name = 'Jonker Walk Heritage Trail',
  slug = 'jonker-walk-heritage-trail',
  description = 'Evening trail along Jonker Street and the Melaka River, covering Baba-Nyonya townhouses, Cheng Hoon Teng and the night market.',
  type_slugs = ARRAY['cultural']
WHERE id = '86c8f52c-3aff-421f-a25d-e2f1528f144e';

UPDATE products SET
  name = 'Merdeka Square Heritage Walk',
  slug = 'merdeka-square-heritage-walk',
  description = 'Colonial-era circuit around Dataran Merdeka, the Sultan Abdul Samad Building, Masjid Jamek and the Klang river confluence.',
  type_slugs = ARRAY['cultural']
WHERE id = '2846fe3d-6f01-413b-a0b1-af6e9d3fe9a0';

UPDATE products SET
  name = 'Siti Khadijah Market & Wau Craft',
  slug = 'siti-khadijah-market-wau-craft',
  description = 'Morning at Kota Bharu''s trader-run Siti Khadijah Market followed by a hands-on wau bulan kite-making session.',
  type_slugs = ARRAY['cultural']
WHERE id = '5e6d3067-736b-4496-ae9e-1d0a3620b957';

UPDATE products SET
  name = 'Sarawak Cultural Village Day',
  slug = 'sarawak-cultural-village-day',
  description = 'Full day at the Sarawak Cultural Village below Mount Santubong — longhouses of seven ethnic groups, craft demos and a dance performance.',
  type_slugs = ARRAY['cultural']
WHERE id = 'cf673897-7a2f-472b-a915-e96df1703d2d';


-- ── 2. The repoint map: every removed clone → the survivor that inherits it ──
-- Rule D7: same vendor first, then nearest surviving city. Never crosses
-- vendors — that would move revenue between payout reports.
-- No ON COMMIT DROP: it would take the table away mid-migration if this file is
-- ever run outside an explicit transaction. Dropped at the bottom instead.
DROP TABLE IF EXISTS repoint;
CREATE TEMP TABLE repoint (doomed UUID PRIMARY KEY, survivor UUID NOT NULL);

INSERT INTO repoint (doomed, survivor) VALUES
  -- Explore Outdoors Malaysia → Batu Ferringhi / Ipoh / Kuah / Kuching / KL
  ('ef85175c-995a-4b71-a4f3-7dd2c1e90cbc', 'd20f5b8a-420f-4e16-a9ee-e1534e8df93a'), -- Mangrove Kayak @ George Town  → Batu Ferringhi (same island)
  ('7cbdd048-8fa8-439f-aab0-2819657d6151', 'd20f5b8a-420f-4e16-a9ee-e1534e8df93a'), -- Sunrise Island   @ George Town  → Batu Ferringhi
  ('8b0eb232-5cdf-4f2f-a0f9-f37c60ae7907', 'd20f5b8a-420f-4e16-a9ee-e1534e8df93a'), -- Sunset Picnic    @ George Town  → Batu Ferringhi
  ('ba06f195-21f5-491d-ac4d-7f2f9dd3cd0f', 'd20f5b8a-420f-4e16-a9ee-e1534e8df93a'), -- Sunrise Island   @ Batu Ferringhi
  ('cd4f37e4-0ea7-4d22-a964-2fa434a66c09', 'd20f5b8a-420f-4e16-a9ee-e1534e8df93a'), -- Sunset Picnic    @ Batu Ferringhi
  ('b31c19da-103a-4af1-af9f-10015701b08d', '3c951980-7957-4e12-856b-ce40959e8900'), -- Mangrove Kayak   @ Ipoh
  ('cdd460ca-2da7-4184-abe6-3c5051a25538', '3c951980-7957-4e12-856b-ce40959e8900'), -- Sunrise Island   @ Ipoh
  ('3476d58a-4cb7-4136-a57d-e9ef10089c25', '3c951980-7957-4e12-856b-ce40959e8900'), -- Sunset Picnic    @ Ipoh
  ('9f232cbf-185d-4356-a31a-2b60f7518e87', '3c951980-7957-4e12-856b-ce40959e8900'), -- Mangrove Kayak   @ Kota Bharu     → Ipoh (nearest)
  ('1c419f38-3765-45d4-a3d7-d7000f8c0c8b', '3c951980-7957-4e12-856b-ce40959e8900'), -- Mangrove Kayak   @ K. Terengganu  → Ipoh
  ('9efbf433-1bf7-46a4-a2c3-8687b2f68ba7', '3c951980-7957-4e12-856b-ce40959e8900'), -- Sunrise Island   @ K. Terengganu  → Ipoh
  ('c95bc543-87c5-4db5-ac85-9cb5595952c3', '3c951980-7957-4e12-856b-ce40959e8900'), -- Sunset Picnic    @ K. Terengganu  → Ipoh
  ('b22094ed-878f-4160-a442-60017762d816', 'bcf78b05-330c-46ca-a3ee-5612ee0feb6f'), -- Canopy Trek      @ Kuah
  ('ecee1ddc-48c0-4e56-ae2f-b4a5dbe64410', 'c4291ea4-b07b-4106-bba0-ac1505b6c74f'), -- Mangrove Kayak   @ Kuching
  ('b847e448-dd50-44e8-acf1-5ba81ffa386f', 'c4291ea4-b07b-4106-bba0-ac1505b6c74f'), -- Sunset Picnic    @ Kuching
  ('dc2ad1fa-da37-40fb-a6fe-a3d4e4fed379', '03db72a4-dc49-4278-a44d-22e1e161b5eb'), -- Mangrove Kayak   @ Kuala Lumpur
  ('e244d9aa-f27f-4607-a8ba-01a42f702443', '03db72a4-dc49-4278-a44d-22e1e161b5eb'), -- Canopy Trek      @ Johor Bahru    → KL
  ('96e7a1a1-f16d-4345-af75-92c422dfcf8a', '03db72a4-dc49-4278-a44d-22e1e161b5eb'), -- Canopy Trek      @ Melaka         → KL
  ('09912725-4f0b-436e-abb2-d4fa08eedabc', '03db72a4-dc49-4278-a44d-22e1e161b5eb'), -- Canopy Trek      @ Seremban       → KL
  ('f89618d4-265b-41e8-af42-030a86209a93', '03db72a4-dc49-4278-a44d-22e1e161b5eb'), -- Sunrise Island   @ Seremban       → KL

  -- Warisan Cultural Journeys → George Town / Melaka / KL / Kota Bharu / Kuching
  ('e18c35da-0e04-42be-a688-bd9c7f41cb62', '93806ba3-a1db-4a28-a8c8-5798a7dea394'), -- Family Quest     @ Batu Ferringhi → George Town
  ('65404e27-7a0e-46e1-aaa8-c5b12755866e', '93806ba3-a1db-4a28-a8c8-5798a7dea394'), -- Family Quest     @ Ipoh           → George Town
  ('aa2928d9-0eb6-4713-a071-cc71c590d599', '93806ba3-a1db-4a28-a8c8-5798a7dea394'), -- Street Food      @ Kuah           → George Town
  ('f93b1715-0a95-416a-ab50-e5725691bf21', '86c8f52c-3aff-421f-a25d-e2f1528f144e'), -- Batik & Tea      @ Johor Bahru    → Melaka
  ('c4ab6660-41dc-46d0-ab98-b68caabfb69f', '86c8f52c-3aff-421f-a25d-e2f1528f144e'), -- Story Walk       @ Johor Bahru    → Melaka
  ('76b7e720-a676-427a-a18c-24302e796b7f', '86c8f52c-3aff-421f-a25d-e2f1528f144e'), -- Street Food      @ Johor Bahru    → Melaka
  ('e8c31979-0d70-460c-ae81-13d7f310b153', '86c8f52c-3aff-421f-a25d-e2f1528f144e'), -- Batik & Tea      @ Melaka
  ('f812b76b-d0e3-4488-aa78-fa7465eb6553', '2846fe3d-6f01-413b-a0b1-af6e9d3fe9a0'), -- Batik & Tea      @ Kuala Lumpur
  ('b859e12c-689e-4ee1-a655-9a921499d140', '2846fe3d-6f01-413b-a0b1-af6e9d3fe9a0'), -- Batik & Tea      @ Kuala Lumpur
  ('76c427f4-6292-43cd-a0ea-a0fcce3cb102', '2846fe3d-6f01-413b-a0b1-af6e9d3fe9a0'), -- Story Walk       @ Kuala Lumpur
  ('479bad4b-4469-4240-a7f4-4e0c7ec73c8f', '2846fe3d-6f01-413b-a0b1-af6e9d3fe9a0'), -- Street Food      @ Kuala Lumpur
  ('1da29e88-76ea-43fe-a7a9-cae34af3306f', '2846fe3d-6f01-413b-a0b1-af6e9d3fe9a0'), -- Family Quest     @ Seremban       → KL
  ('81fbbaa7-beca-4577-af97-b28148a630e0', '2846fe3d-6f01-413b-a0b1-af6e9d3fe9a0'), -- Street Food      @ Seremban       → KL
  ('acdd5dec-2599-4b69-a699-dc5e3e36ae96', '5e6d3067-736b-4496-ae9e-1d0a3620b957'), -- Story Walk       @ Kota Bharu
  ('995af34c-99dd-4e18-a348-748ca7c1a6b1', '5e6d3067-736b-4496-ae9e-1d0a3620b957'), -- Family Quest     @ K. Terengganu  → Kota Bharu
  ('05d77811-542d-4075-a917-ee66ec47ad10', 'cf673897-7a2f-472b-a915-e96df1703d2d'), -- Story Walk       @ Kuching
  ('8370b59e-927a-4e97-aebb-9b4e7dee57ed', 'cf673897-7a2f-472b-a915-e96df1703d2d'), -- Batik & Tea      @ Kota Kinabalu  → Kuching (same Borneo)
  ('aed6ab33-ea8b-4b10-a559-4fe2a681e134', 'cf673897-7a2f-472b-a915-e96df1703d2d'), -- Story Walk       @ Kota Kinabalu  → Kuching
  ('f24c91e4-c5f9-49b6-a3ae-53e581174de4', 'cf673897-7a2f-472b-a915-e96df1703d2d'), -- Street Food      @ Kota Kinabalu  → Kuching

  -- Batik Nusantara Studio: the duplicate workshop keeps its city's survivor
  ('a9a7dc20-5f7a-4299-a49a-75ed480b31b5', 'b60333b2-299a-4df2-8709-276c970ca4b5'); -- Batik Story Workshop @ Kuantan


-- Fail loudly rather than half-migrate if the map drifted from the catalogue.
DO $$
DECLARE
  bad INT;
BEGIN
  SELECT COUNT(*) INTO bad FROM repoint r
   WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = r.doomed)
      OR NOT EXISTS (SELECT 1 FROM products p WHERE p.id = r.survivor);
  IF bad > 0 THEN
    RAISE EXCEPTION 'repoint map references % product id(s) that do not exist', bad;
  END IF;

  -- D7: a repoint must never move revenue between vendors.
  SELECT COUNT(*) INTO bad
    FROM repoint r
    JOIN products d ON d.id = r.doomed
    JOIN products s ON s.id = r.survivor
   WHERE d.vendor_id <> s.vendor_id;
  IF bad > 0 THEN
    RAISE EXCEPTION '% repoint(s) would cross vendors', bad;
  END IF;
END $$;


-- ── 3. Repoint booking slots ────────────────────────────────────────────────
-- Slot ids are preserved, so every order_items.slot_id / bookings.slot_id that
-- points at them stays valid. (booking_slots.product_id is ON DELETE CASCADE —
-- without this step the delete below would silently take 2,783 bookings' slots
-- with it.)
UPDATE booking_slots b
   SET product_id = r.survivor,
       outlet_id  = s.outlet_id
  FROM repoint r
  JOIN products s ON s.id = r.survivor
 WHERE b.product_id = r.doomed;


-- ── 4. Repoint order lines ──────────────────────────────────────────────────
-- variant_id has to move too: product_variants cascades on product delete, and
-- order_items.variant_id is NO ACTION, so leaving it would abort the delete.
-- The denormalised snapshot columns follow so vendor dashboards read coherently.
UPDATE order_items oi
   SET product_id   = r.survivor,
       variant_id   = v.id,
       outlet_id    = s.outlet_id,
       product_name = s.name,
       variant_name = v.name,
       image_url    = s.cover_url
  FROM repoint r
  JOIN products s ON s.id = r.survivor
  JOIN LATERAL (
        SELECT pv.id, pv.name
          FROM product_variants pv
         WHERE pv.product_id = s.id
         ORDER BY pv.is_default DESC, pv.sort_order, pv.created_at
         LIMIT 1
       ) v ON TRUE
 WHERE oi.product_id = r.doomed;


-- ── 5. Repoint reviews ──────────────────────────────────────────────────────
-- outlet_id moves with product_id. Leaving it behind would attach the review to
-- an outlet that no longer sells the product, which corrupts the per-outlet
-- rating that getOutletReviewMetrics() shows on the detail page.
UPDATE reviews rv
   SET product_id = r.survivor,
       outlet_id  = s.outlet_id
  FROM repoint r
  JOIN products s ON s.id = r.survivor
 WHERE rv.product_id = r.doomed;


-- ── 6. Wishlists ────────────────────────────────────────────────────────────
-- customer_wishlists cascades anyway; delete explicitly because repointing
-- would violate the (user_id, product_id) unique key when a customer has
-- saved both the clone and its survivor.
DELETE FROM customer_wishlists w USING repoint r WHERE w.product_id = r.doomed;


-- ── 7. Nothing may still depend on a doomed product ─────────────────────────
DO $$
DECLARE
  leftover INT;
BEGIN
  SELECT
      (SELECT COUNT(*) FROM order_items   WHERE product_id IN (SELECT doomed FROM repoint))
    + (SELECT COUNT(*) FROM reviews       WHERE product_id IN (SELECT doomed FROM repoint))
    + (SELECT COUNT(*) FROM booking_slots WHERE product_id IN (SELECT doomed FROM repoint))
    INTO leftover;
  IF leftover > 0 THEN
    RAISE EXCEPTION 'refusing to delete: % dependent row(s) still point at a removed product', leftover;
  END IF;
END $$;


-- ── 8. Delete the clones ────────────────────────────────────────────────────
-- Explicit id list via the map, never a name/pattern match.
DELETE FROM products WHERE id IN (SELECT doomed FROM repoint);


-- ── 9. Outlets left with nothing to sell ────────────────────────────────────
-- Deactivated, not deleted: order_items.outlet_id still references them.
--
-- The outlet_offers clause is NOT optional. A shared product carries
-- products.outlet_id = NULL and reaches its outlets only through outlet_offers
-- — every food product is modelled that way. Testing products.outlet_id alone
-- reads those outlets as empty and switches off the entire Food catalogue;
-- 20260801030000 exists to undo exactly that.
UPDATE outlets o
   SET status = 'inactive'
 WHERE o.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM products p WHERE p.outlet_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM outlet_offers oo WHERE oo.outlet_id = o.id AND oo.status = 'active');


-- ── 10. Post-conditions ─────────────────────────────────────────────────────
DO $$
DECLARE
  remaining INT;
  dupes     INT;
BEGIN
  SELECT COUNT(*) INTO remaining
    FROM products p JOIN categories c ON c.id = p.category_id
   WHERE c.slug = 'activity' AND p.type_slugs && ARRAY['nature','cultural','adventure'];
  IF remaining <> 15 THEN
    RAISE EXCEPTION 'expected 15 place-bound activities, found %', remaining;
  END IF;

  -- No activity name may exist in more than one city any more.
  SELECT COUNT(*) INTO dupes FROM (
    SELECT p.name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN outlets o    ON o.id = p.outlet_id
     WHERE c.slug = 'activity' AND p.type_slugs && ARRAY['nature','cultural','adventure']
     GROUP BY p.name HAVING COUNT(DISTINCT o.city) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION '% activity name(s) still appear in more than one city', dupes;
  END IF;

  -- A review must never sit on an outlet that does not sell its product.
  SELECT COUNT(*) INTO dupes
    FROM reviews r
    JOIN products p ON p.id = r.product_id
   WHERE r.outlet_id IS NOT NULL
     AND p.outlet_id IS NOT NULL
     AND r.outlet_id <> p.outlet_id
     AND NOT EXISTS (SELECT 1 FROM outlet_offers oo WHERE oo.product_id = p.id AND oo.outlet_id = r.outlet_id);
  IF dupes > 0 THEN
    RAISE EXCEPTION '% review(s) point at an outlet that does not sell the product', dupes;
  END IF;
END $$;

DROP TABLE IF EXISTS repoint;
