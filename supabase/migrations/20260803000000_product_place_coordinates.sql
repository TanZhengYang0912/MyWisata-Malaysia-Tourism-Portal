-- ============================================================
-- 20260803000000_product_place_coordinates.sql
--
-- docs/plans/2026-08-03-0237-dev-explore-discovery-map.md, Phase 1.
--
-- A place-bound product (nature/cultural/adventure) is currently mapped by
-- products.outlet_id — the provider's office, not the destination. Plotting
-- "Bako National Park Coastal Trail" at its Kuching provider outlet would
-- point a map at the wrong place entirely.
--
-- These columns give a place-bound product its own coordinate, independent
-- of the outlet that sells it. Nullable: only the 13 verified place-bound
-- products below get one. Never inferred from the outlet — a missing
-- coordinate means the product is omitted from the map, not mis-plotted.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS place_state    TEXT,
  ADD COLUMN IF NOT EXISTS place_district TEXT,
  ADD COLUMN IF NOT EXISTS place_lat      NUMERIC,
  ADD COLUMN IF NOT EXISTS place_lng      NUMERIC;

-- Coordinates arrive as a pair or not at all; state is required whenever a
-- coordinate is present (district stays nullable — Federal Territories and
-- Perlis have no district tier).
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_place_coords_complete;
ALTER TABLE products ADD CONSTRAINT products_place_coords_complete CHECK (
  (place_lat IS NULL AND place_lng IS NULL)
  OR (
    place_lat IS NOT NULL AND place_lng IS NOT NULL
    AND place_lat BETWEEN -90 AND 90
    AND place_lng BETWEEN -180 AND 180
    AND place_state IS NOT NULL
  )
);

-- 13 of the 14 active/approved nature+cultural+adventure products get a
-- verified destination coordinate. "Batik Story Workshop" is deliberately
-- excluded — it's a workshop held inside the vendor's own shop, not a place
-- of its own (see the plan's Δ3). It stays NULL and shows up in the dev
-- map's "missing place coordinate" warning list instead of guessing.
UPDATE products p SET
  place_state = m.st, place_district = m.di, place_lat = m.la, place_lng = m.ln
FROM (VALUES
  ('bcf78b05-330c-46ca-a3ee-5612ee0feb6f'::uuid, 'Kedah',       'Langkawi',      6.4167,  99.8556),  -- Kilim Geoforest Mangrove Kayak
  ('5e6d3067-736b-4496-ae9e-1d0a3620b957'::uuid, 'Kelantan',    'Kota Bharu',    6.1256, 102.2386),  -- Siti Khadijah Market & Wau Craft
  ('2846fe3d-6f01-413b-a0b1-af6e9d3fe9a0'::uuid, 'Kuala Lumpur', NULL,           3.1478, 101.6935),  -- Merdeka Square Heritage Walk
  ('86c8f52c-3aff-421f-a25d-e2f1528f144e'::uuid, 'Melaka',      'Melaka Tengah', 2.1953, 102.2470),  -- Jonker Walk Heritage Trail
  ('b60333b2-299a-4df2-8709-276c970ca4b5'::uuid, 'Pahang',      'Kuantan',       3.8500, 103.0500),  -- Gunung Tapis Waterfall Hike
  ('93806ba3-a1db-4a28-a8c8-5798a7dea394'::uuid, 'Penang',      'Timur Laut',    5.4141, 100.3288),  -- George Town Story Walk
  ('d20f5b8a-420f-4e16-a9ee-e1534e8df93a'::uuid, 'Penang',      'Barat Daya',    5.4700, 100.1900),  -- Penang National Park Monkey Beach Trek
  ('3c951980-7957-4e12-856b-ce40959e8900'::uuid, 'Perak',       'Kinta',         4.6300, 101.1400),  -- Kinta Valley Limestone Hike
  ('843f1aa4-f142-4e4a-984b-cdb4d93dcc5f'::uuid, 'Sabah',       'Ranau',         6.0050, 116.5583),  -- Mount Kinabalu Foothill Trail
  ('0a3b3258-42b6-4ab4-a70d-b88339123e5f'::uuid, 'Sabah',       'Kinabatangan',  5.5300, 118.3200),  -- River & Rainforest Discovery
  ('c4291ea4-b07b-4106-bba0-ac1505b6c74f'::uuid, 'Sarawak',     'Kuching',       1.7167, 110.4667),  -- Bako National Park Coastal Trail
  ('cf673897-7a2f-472b-a915-e96df1703d2d'::uuid, 'Sarawak',     'Kuching',       1.7533, 110.3197),  -- Sarawak Cultural Village Day
  ('5b9edc5c-0a24-4a68-966c-c52da4a30766'::uuid, 'Terengganu',  'Setiu',         5.6667, 102.7167)   -- Setiu Wetlands Nature Walk
) AS m(id, st, di, la, ln)
WHERE p.id = m.id;

-- Post-condition: exactly 13 filled. If this ever drifts, the mapping above
-- is stale against the live catalogue and needs a human look, not a silent
-- partial backfill.
DO $$
DECLARE filled INT;
BEGIN
  SELECT COUNT(*) INTO filled FROM products WHERE place_lat IS NOT NULL;
  IF filled <> 13 THEN
    RAISE EXCEPTION 'expected 13 products with place coordinates, found %', filled;
  END IF;
END $$;
