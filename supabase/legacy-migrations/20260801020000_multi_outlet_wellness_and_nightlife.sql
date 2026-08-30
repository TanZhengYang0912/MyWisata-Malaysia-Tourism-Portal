-- ============================================================
-- 20260801020000_multi_outlet_wellness_and_nightlife.sql
--
-- Phase 3 of docs/plans/2026-07-31-2326-activity-place-bound-detail-pages.md
--
-- Two vendors, opposite lessons about what a "branch" means (decision D4):
--
--   Serenity Wellness Retreats — a spa's product is the TREATMENT, not the
--     building, so the same treatment genuinely exists at every branch. Cut to
--     3 outlets × 3 DISTINCT treatments and list each one at all three through
--     outlet_offers.
--
--   Selat Nightlife Group — Skybar Rooftop Lounge and Warehouse Techno Club are
--     different venues, not one product with three branches. The bars stay as
--     separate products; only the surplus outlet goes.
--
-- Same repoint-then-delete discipline as Phase 2: no order line, review or
-- booking slot is dropped.
--
-- NOTE 1 — no TEMP table. The Supabase SQL Editor runs each execution in its
--   own session, so a TEMP table created by one statement is gone by the next.
--   The repoint map is inlined as a CTE in every statement that needs it.
-- NOTE 2 — every statement is re-runnable. Once the six surplus products are
--   deleted the repoint updates match nothing, and the offer insert upserts.
-- NOTE 3 — the plan's finding F4 ("outlet_offers is dead") is WRONG. Migration
--   20260723000001 already seeded 50 offers for the food vendors, and the
--   detail page's outlet picker has been rendering for them all along. The
--   post-conditions below therefore scope their counts to Serenity.
-- ============================================================


-- ── 1. Three distinct Serenity treatments ───────────────────────────────────
-- The seed cloned one "Traditional Massage Escape" into every city. A picker
-- offering the same treatment three times teaches nothing.
UPDATE products SET
  name = 'Aromatherapy Hot Stone Ritual',
  slug = 'aromatherapy-hot-stone-ritual',
  description = 'Ninety minutes of warmed basalt stone work with a locally blended lemongrass and pandan oil, finished with a scalp massage.'
WHERE id = 'ef8e4839-9970-4488-a364-d8854788d7a0';   -- George Town

UPDATE products SET
  name = 'Herbal Steam & Body Scrub',
  slug = 'herbal-steam-body-scrub',
  description = 'Traditional herbal steam followed by a turmeric and rice bran scrub, drawn from Malay postnatal spa practice.'
WHERE id = '6f08fef3-f6cf-4012-af1a-d30baf084c34';   -- Kota Kinabalu

-- d1d8bcb1 (Kuala Lumpur) keeps the name "Traditional Massage Escape".


-- ── 2. Guard: the repoint must never move revenue between vendors (D7) ──────
DO $$
DECLARE bad INT;
BEGIN
  SELECT COUNT(*) INTO bad
    FROM (VALUES
      ('240a97cb-f1ac-4da6-a79b-930b471b6f1e'::uuid, 'ef8e4839-9970-4488-a364-d8854788d7a0'::uuid),
      ('6cd4a090-3d54-460b-a62d-c64df165a1ba',       'ef8e4839-9970-4488-a364-d8854788d7a0'),
      ('6d44b9e2-f5f6-4da8-8210-241476449e2a',       'ef8e4839-9970-4488-a364-d8854788d7a0'),
      ('4a424c57-bf00-4e66-a35e-d902c12819fe',       '6f08fef3-f6cf-4012-af1a-d30baf084c34'),
      ('14f7a0ec-89d5-46d4-99b5-3a83fa09df6b',       'd1d8bcb1-0a58-45ba-a54a-5eea92e80ad0'),
      ('1b3f0195-c314-4529-abb6-08dfbec5c976',       'd1d8bcb1-0a58-45ba-a54a-5eea92e80ad0')
    ) AS r(doomed, survivor)
    JOIN products d ON d.id = r.doomed
    JOIN products s ON s.id = r.survivor
   WHERE d.vendor_id <> s.vendor_id;
  IF bad > 0 THEN RAISE EXCEPTION '% wellness repoint(s) would cross vendors', bad; END IF;
END $$;


-- ── 3. Repoint booking slots ────────────────────────────────────────────────
-- Slots first: booking_slots.product_id cascades on product delete, while
-- order_items.slot_id and bookings.slot_id are NO ACTION. Moving the slot keeps
-- its id, so every order and booking that references it stays valid.
WITH repoint(doomed, survivor) AS (VALUES
  ('240a97cb-f1ac-4da6-a79b-930b471b6f1e'::uuid, 'ef8e4839-9970-4488-a364-d8854788d7a0'::uuid),
  ('6cd4a090-3d54-460b-a62d-c64df165a1ba',       'ef8e4839-9970-4488-a364-d8854788d7a0'),
  ('6d44b9e2-f5f6-4da8-8210-241476449e2a',       'ef8e4839-9970-4488-a364-d8854788d7a0'),
  ('4a424c57-bf00-4e66-a35e-d902c12819fe',       '6f08fef3-f6cf-4012-af1a-d30baf084c34'),
  ('14f7a0ec-89d5-46d4-99b5-3a83fa09df6b',       'd1d8bcb1-0a58-45ba-a54a-5eea92e80ad0'),
  ('1b3f0195-c314-4529-abb6-08dfbec5c976',       'd1d8bcb1-0a58-45ba-a54a-5eea92e80ad0'))
UPDATE booking_slots b
   SET product_id = r.survivor, outlet_id = s.outlet_id
  FROM repoint r JOIN products s ON s.id = r.survivor
 WHERE b.product_id = r.doomed;


-- ── 4. Repoint order lines ──────────────────────────────────────────────────
-- variant_id moves too: product_variants cascades on product delete but
-- order_items.variant_id is NO ACTION, which would abort the delete. The
-- denormalised snapshot columns follow so vendor dashboards read coherently.
WITH repoint(doomed, survivor) AS (VALUES
  ('240a97cb-f1ac-4da6-a79b-930b471b6f1e'::uuid, 'ef8e4839-9970-4488-a364-d8854788d7a0'::uuid),
  ('6cd4a090-3d54-460b-a62d-c64df165a1ba',       'ef8e4839-9970-4488-a364-d8854788d7a0'),
  ('6d44b9e2-f5f6-4da8-8210-241476449e2a',       'ef8e4839-9970-4488-a364-d8854788d7a0'),
  ('4a424c57-bf00-4e66-a35e-d902c12819fe',       '6f08fef3-f6cf-4012-af1a-d30baf084c34'),
  ('14f7a0ec-89d5-46d4-99b5-3a83fa09df6b',       'd1d8bcb1-0a58-45ba-a54a-5eea92e80ad0'),
  ('1b3f0195-c314-4529-abb6-08dfbec5c976',       'd1d8bcb1-0a58-45ba-a54a-5eea92e80ad0'))
UPDATE order_items oi
   SET product_id = r.survivor, variant_id = v.id, outlet_id = s.outlet_id,
       product_name = s.name, variant_name = v.name, image_url = s.cover_url
  FROM repoint r JOIN products s ON s.id = r.survivor
  JOIN LATERAL (SELECT pv.id, pv.name FROM product_variants pv WHERE pv.product_id = s.id
                 ORDER BY pv.is_default DESC, pv.sort_order, pv.created_at LIMIT 1) v ON TRUE
 WHERE oi.product_id = r.doomed;


-- ── 5. Repoint reviews ──────────────────────────────────────────────────────
-- outlet_id moves with product_id, or the review sits on an outlet that does
-- not sell the product and corrupts getOutletReviewMetrics()'s per-outlet rating.
WITH repoint(doomed, survivor) AS (VALUES
  ('240a97cb-f1ac-4da6-a79b-930b471b6f1e'::uuid, 'ef8e4839-9970-4488-a364-d8854788d7a0'::uuid),
  ('6cd4a090-3d54-460b-a62d-c64df165a1ba',       'ef8e4839-9970-4488-a364-d8854788d7a0'),
  ('6d44b9e2-f5f6-4da8-8210-241476449e2a',       'ef8e4839-9970-4488-a364-d8854788d7a0'),
  ('4a424c57-bf00-4e66-a35e-d902c12819fe',       '6f08fef3-f6cf-4012-af1a-d30baf084c34'),
  ('14f7a0ec-89d5-46d4-99b5-3a83fa09df6b',       'd1d8bcb1-0a58-45ba-a54a-5eea92e80ad0'),
  ('1b3f0195-c314-4529-abb6-08dfbec5c976',       'd1d8bcb1-0a58-45ba-a54a-5eea92e80ad0'))
UPDATE reviews rv
   SET product_id = r.survivor, outlet_id = s.outlet_id
  FROM repoint r JOIN products s ON s.id = r.survivor
 WHERE rv.product_id = r.doomed;


-- ── 6. Wishlists ────────────────────────────────────────────────────────────
-- Cascades on delete anyway; removed explicitly because repointing would
-- violate the (user_id, product_id) unique key for a customer who saved both.
DELETE FROM customer_wishlists
 WHERE product_id IN (
   '240a97cb-f1ac-4da6-a79b-930b471b6f1e','6cd4a090-3d54-460b-a62d-c64df165a1ba',
   '6d44b9e2-f5f6-4da8-8210-241476449e2a','4a424c57-bf00-4e66-a35e-d902c12819fe',
   '14f7a0ec-89d5-46d4-99b5-3a83fa09df6b','1b3f0195-c314-4529-abb6-08dfbec5c976');


-- ── 7. Nothing may still depend on a product about to be deleted ────────────
DO $$
DECLARE leftover INT;
  doomed UUID[] := ARRAY[
    '240a97cb-f1ac-4da6-a79b-930b471b6f1e','6cd4a090-3d54-460b-a62d-c64df165a1ba',
    '6d44b9e2-f5f6-4da8-8210-241476449e2a','4a424c57-bf00-4e66-a35e-d902c12819fe',
    '14f7a0ec-89d5-46d4-99b5-3a83fa09df6b','1b3f0195-c314-4529-abb6-08dfbec5c976']::UUID[];
BEGIN
  SELECT (SELECT COUNT(*) FROM order_items   WHERE product_id = ANY(doomed))
       + (SELECT COUNT(*) FROM reviews       WHERE product_id = ANY(doomed))
       + (SELECT COUNT(*) FROM booking_slots WHERE product_id = ANY(doomed))
    INTO leftover;
  IF leftover > 0 THEN RAISE EXCEPTION 'refusing to delete: % dependent row(s) remain', leftover; END IF;
END $$;


-- ── 8. Delete the six surplus treatments ────────────────────────────────────
DELETE FROM products
 WHERE id IN (
   '240a97cb-f1ac-4da6-a79b-930b471b6f1e','6cd4a090-3d54-460b-a62d-c64df165a1ba',
   '6d44b9e2-f5f6-4da8-8210-241476449e2a','4a424c57-bf00-4e66-a35e-d902c12819fe',
   '14f7a0ec-89d5-46d4-99b5-3a83fa09df6b','1b3f0195-c314-4529-abb6-08dfbec5c976');


-- ── 9. List all three treatments at all three branches ──────────────────────
-- Prices differ per outlet on purpose: with identical prices the picker has
-- nothing to distinguish and the multi-outlet path cannot be checked by eye.
INSERT INTO outlet_offers (product_id, outlet_id, price, status) VALUES
  -- Traditional Massage Escape
  ('d1d8bcb1-0a58-45ba-a54a-5eea92e80ad0', '48414df6-7ab4-4bac-b8c1-21dc50617aa1', 118.00, 'active'), -- Kuala Lumpur
  ('d1d8bcb1-0a58-45ba-a54a-5eea92e80ad0', '5a40102c-17d8-4d2f-950e-562db417209a', 112.00, 'active'), -- George Town
  ('d1d8bcb1-0a58-45ba-a54a-5eea92e80ad0', 'd1bba5d6-7751-4e4c-b62b-82d76b093eee', 108.00, 'active'), -- Kota Kinabalu
  -- Aromatherapy Hot Stone Ritual
  ('ef8e4839-9970-4488-a364-d8854788d7a0', '48414df6-7ab4-4bac-b8c1-21dc50617aa1', 145.00, 'active'),
  ('ef8e4839-9970-4488-a364-d8854788d7a0', '5a40102c-17d8-4d2f-950e-562db417209a', 138.00, 'active'),
  ('ef8e4839-9970-4488-a364-d8854788d7a0', 'd1bba5d6-7751-4e4c-b62b-82d76b093eee', 132.00, 'active'),
  -- Herbal Steam & Body Scrub
  ('6f08fef3-f6cf-4012-af1a-d30baf084c34', '48414df6-7ab4-4bac-b8c1-21dc50617aa1',  98.00, 'active'),
  ('6f08fef3-f6cf-4012-af1a-d30baf084c34', '5a40102c-17d8-4d2f-950e-562db417209a',  92.00, 'active'),
  ('6f08fef3-f6cf-4012-af1a-d30baf084c34', 'd1bba5d6-7751-4e4c-b62b-82d76b093eee',  88.00, 'active')
ON CONFLICT (product_id, outlet_id) DO UPDATE SET price = EXCLUDED.price, status = 'active';


-- ── 10. Selat: the bars stay products, the surplus outlet goes ──────────────
-- Moved to the branch each venue actually reads as, not dumped on one outlet.
UPDATE products SET outlet_id = 'ffffffff-2000-0000-0000-000000000001'
 WHERE id = '9c85a701-62fc-4604-8a59-9c3c488b9b55';   -- Karaoke & Cocktails Lounge → Bukit Bintang
UPDATE products SET outlet_id = 'ffffffff-2000-0000-0000-000000000004'
 WHERE id = 'dc10b262-cf5d-49a0-b4d6-9ae894a55bcb';   -- Riverside Night Market Bar → Kuching Waterfront

UPDATE order_items oi SET outlet_id = p.outlet_id FROM products p
 WHERE p.id = oi.product_id
   AND oi.product_id IN ('9c85a701-62fc-4604-8a59-9c3c488b9b55','dc10b262-cf5d-49a0-b4d6-9ae894a55bcb');
UPDATE reviews rv SET outlet_id = p.outlet_id FROM products p
 WHERE p.id = rv.product_id
   AND rv.product_id IN ('9c85a701-62fc-4604-8a59-9c3c488b9b55','dc10b262-cf5d-49a0-b4d6-9ae894a55bcb');


-- ── 11. Deactivate the emptied outlets ──────────────────────────────────────
-- Never deleted: order_items.outlet_id and reviews.outlet_id still reference
-- them. An outlet that holds no product but does carry an active offer stays
-- open — that is exactly the Serenity case.
UPDATE outlets o SET status = 'inactive'
 WHERE o.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM products p WHERE p.outlet_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM outlet_offers oo WHERE oo.outlet_id = o.id AND oo.status = 'active');


-- ── 12. Post-conditions ─────────────────────────────────────────────────────
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM outlets o JOIN vendors v ON v.id = o.vendor_id
   WHERE v.name = 'Serenity Wellness Retreats' AND o.status = 'active';
  IF n <> 3 THEN RAISE EXCEPTION 'Serenity should have 3 active outlets, has %', n; END IF;

  SELECT COUNT(*) INTO n FROM products p WHERE p.vendor_id =
    (SELECT id FROM vendors WHERE name = 'Serenity Wellness Retreats');
  IF n <> 3 THEN RAISE EXCEPTION 'Serenity should have 3 products, has %', n; END IF;

  -- Scoped to Serenity: the food vendors already had 50 offers from migration
  -- 20260723000001, so a global count here would be meaningless.
  SELECT COUNT(*) INTO n FROM outlet_offers oo JOIN products p ON p.id = oo.product_id
   WHERE p.vendor_id = (SELECT id FROM vendors WHERE name = 'Serenity Wellness Retreats')
     AND oo.status = 'active';
  IF n <> 9 THEN RAISE EXCEPTION 'expected 9 active Serenity offers, found %', n; END IF;

  SELECT COUNT(*) INTO n FROM outlets o JOIN vendors v ON v.id = o.vendor_id
   WHERE v.name = 'Selat Nightlife Group' AND o.status = 'active';
  IF n <> 3 THEN RAISE EXCEPTION 'Selat should have 3 active outlets, has %', n; END IF;

  SELECT COUNT(*) INTO n FROM products p WHERE p.vendor_id =
    (SELECT id FROM vendors WHERE name = 'Selat Nightlife Group');
  IF n <> 10 THEN RAISE EXCEPTION 'Selat should still have all 10 bars, has %', n; END IF;

  -- Every offer must sit on an outlet belonging to the product's own vendor.
  SELECT COUNT(*) INTO n FROM outlet_offers oo
    JOIN products p ON p.id = oo.product_id
    JOIN outlets  o ON o.id = oo.outlet_id
   WHERE p.vendor_id <> o.vendor_id;
  IF n > 0 THEN RAISE EXCEPTION '% offer(s) sit on another vendor''s outlet', n; END IF;

  -- A review must never sit on an outlet that does not sell its product.
  SELECT COUNT(*) INTO n FROM reviews r JOIN products p ON p.id = r.product_id
   WHERE r.outlet_id IS NOT NULL AND p.outlet_id IS NOT NULL AND r.outlet_id <> p.outlet_id
     AND NOT EXISTS (SELECT 1 FROM outlet_offers oo WHERE oo.product_id = p.id AND oo.outlet_id = r.outlet_id);
  IF n > 0 THEN RAISE EXCEPTION '% review(s) point at a non-selling outlet', n; END IF;
END $$;
