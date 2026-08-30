-- Federal territory place model — Kuala Lumpur, Putrajaya, and Labuan.
--
-- These three destinations were the last entries still using the legacy
-- destination page. This migration gives the shared state-level place page a
-- complete, filterable place tree without changing the places schema or
-- fabricating catalogue products.

BEGIN;

INSERT INTO places (
  id, parent_id, level, name, slug, tagline, intro, state, district,
  lat, lng, entry_fee, image_url
)
VALUES
  (
    md5('federal-territories:state:kuala-lumpur')::uuid, NULL, 'state',
    'Kuala Lumpur', 'kuala-lumpur',
    'Malaysia''s modern skyline in one glance.',
    'Malaysia''s energetic capital pairs a modern skyline with neighbourhood food, shopping and city culture.',
    'Kuala Lumpur', NULL, 3.1478, 101.6935, NULL, NULL
  ),
  (
    md5('federal-territories:state:putrajaya')::uuid, NULL, 'state',
    'Putrajaya', 'putrajaya',
    'Pink domes, lakeside views and calm boulevards.',
    'A calm planned city of pink domes, lakeside views and spacious boulevards.',
    'Putrajaya', NULL, 2.9264, 101.6964, NULL, NULL
  ),
  (
    md5('federal-territories:state:labuan')::uuid, NULL, 'state',
    'Labuan', 'labuan',
    'Quiet island shores and marine escapes.',
    'A quiet island escape for beaches, marine views and a slower coastal rhythm.',
    'Labuan', NULL, 5.2831, 115.2308, NULL, NULL
  )
ON CONFLICT (slug) DO NOTHING;

WITH region_values (state_slug, name, slug, district, lat, lng) AS (
  VALUES
    ('kuala-lumpur', 'City Centre', 'kuala-lumpur-city-centre', 'Kuala Lumpur', 3.1478, 101.6935),
    ('kuala-lumpur', 'Bukit Nanas', 'bukit-nanas', 'Kuala Lumpur', 3.1528, 101.7038),
    ('kuala-lumpur', 'Brickfields', 'brickfields', 'Kuala Lumpur', 3.1279, 101.6869),
    ('kuala-lumpur', 'Bangsar', 'bangsar', 'Kuala Lumpur', 3.1266, 101.6681),
    ('putrajaya', 'Precinct 1', 'putrajaya-precinct-1', 'Putrajaya', 2.9361, 101.6919),
    ('putrajaya', 'Precinct 2', 'putrajaya-precinct-2', 'Putrajaya', 2.9251, 101.6968),
    ('putrajaya', 'Precinct 5', 'putrajaya-precinct-5', 'Putrajaya', 2.9200, 101.6836),
    ('putrajaya', 'Precinct 15', 'putrajaya-precinct-15', 'Putrajaya', 2.8976, 101.6766),
    ('labuan', 'Victoria', 'victoria-labuan', 'Victoria', 5.2767, 115.2417),
    ('labuan', 'Pohon Batu', 'pohon-batu', 'Pohon Batu', 5.3165, 115.1811),
    ('labuan', 'Sungai Labu', 'sungai-labu', 'Sungai Labu', 5.2546, 115.1804),
    ('labuan', 'Layang-Layang', 'layang-layang-labuan', 'Layang-Layang', 5.2377, 115.1930)
)
INSERT INTO places (
  id, parent_id, level, name, slug, state, district, lat, lng, entry_fee
)
SELECT
  md5('federal-territories:region:' || region_values.slug)::uuid,
  states.id,
  'region',
  region_values.name,
  region_values.slug,
  states.state,
  region_values.district,
  region_values.lat,
  region_values.lng,
  NULL
FROM region_values
JOIN places states ON states.slug = region_values.state_slug
ON CONFLICT (slug) DO NOTHING;

WITH poi_values (region_slug, name, slug, state, district, lat, lng, entry_fee, tagline) AS (
  VALUES
    ('kuala-lumpur-city-centre', 'Petronas Twin Towers', 'petronas-twin-towers', 'Kuala Lumpur', 'Kuala Lumpur', 3.1579, 101.7116, 0, 'Malaysia''s signature skyline landmark.'),
    ('kuala-lumpur-city-centre', 'Dataran Merdeka', 'dataran-merdeka', 'Kuala Lumpur', 'Kuala Lumpur', 3.1488, 101.6933, 0, 'A historic square at the heart of the city.'),
    ('kuala-lumpur-city-centre', 'Central Market Kuala Lumpur', 'central-market-kuala-lumpur', 'Kuala Lumpur', 'Kuala Lumpur', 3.1457, 101.6958, 0, 'Local craft, colour and market life.'),
    ('kuala-lumpur-city-centre', 'KL Tower', 'kl-tower', 'Kuala Lumpur', 'Kuala Lumpur', 3.1528, 101.7038, 49, 'A high-rise view across the capital.'),
    ('bukit-nanas', 'Bukit Nanas Forest Reserve', 'bukit-nanas-forest-reserve', 'Kuala Lumpur', 'Kuala Lumpur', 3.1528, 101.7038, 0, 'A pocket of rainforest below the skyline.'),
    ('bukit-nanas', 'Jalan Alor', 'jalan-alor', 'Kuala Lumpur', 'Kuala Lumpur', 3.1448, 101.7004, 0, 'An evening street of Malaysian flavours.'),
    ('brickfields', 'National Mosque of Malaysia', 'national-mosque-kuala-lumpur', 'Kuala Lumpur', 'Kuala Lumpur', 3.1412, 101.6917, 0, 'Modern Islamic architecture and calm courtyards.'),
    ('brickfields', 'Islamic Arts Museum Malaysia', 'islamic-arts-museum-malaysia', 'Kuala Lumpur', 'Kuala Lumpur', 3.1418, 101.6892, 20, 'A thoughtful collection of Islamic art.'),
    ('bangsar', 'Perdana Botanical Gardens', 'perdana-botanical-gardens', 'Kuala Lumpur', 'Kuala Lumpur', 3.1443, 101.6849, 0, 'Green space for a slower city morning.'),
    ('bangsar', 'Thean Hou Temple', 'thean-hou-temple', 'Kuala Lumpur', 'Kuala Lumpur', 3.1018, 101.6869, 0, 'A hilltop temple with wide city views.'),

    ('putrajaya-precinct-1', 'Putra Mosque', 'putra-mosque', 'Putrajaya', 'Putrajaya', 2.9360, 101.6916, 0, 'The pink-domed icon beside Putrajaya Lake.'),
    ('putrajaya-precinct-1', 'Perdana Putra', 'perdana-putra', 'Putrajaya', 'Putrajaya', 2.9350, 101.6913, 0, 'A landmark government complex on the hill.'),
    ('putrajaya-precinct-1', 'Putrajaya Lake', 'putrajaya-lake', 'Putrajaya', 'Putrajaya', 2.9236, 101.6965, 0, 'A broad lake framed by the city''s bridges.'),
    ('putrajaya-precinct-2', 'Seri Wawasan Bridge', 'seri-wawasan-bridge', 'Putrajaya', 'Putrajaya', 2.9214, 101.6969, 0, 'A cable-stayed bridge with a sculptural silhouette.'),
    ('putrajaya-precinct-2', 'Putrajaya Botanical Garden', 'putrajaya-botanical-garden', 'Putrajaya', 'Putrajaya', 2.9378, 101.6854, 0, 'Tropical planting and lakeside walking paths.'),
    ('putrajaya-precinct-5', 'Putrajaya Wetlands Park', 'putrajaya-wetlands-park', 'Putrajaya', 'Putrajaya', 2.9600, 101.6982, 0, 'A calm wetland landscape for birdwatching.'),
    ('putrajaya-precinct-5', 'Moroccan Pavilion Putrajaya', 'moroccan-pavilion-putrajaya', 'Putrajaya', 'Putrajaya', 2.9406, 101.6831, 3, 'Ornamented courtyards inspired by Moroccan design.'),
    ('putrajaya-precinct-15', 'Millennium Monument Putrajaya', 'millennium-monument-putrajaya', 'Putrajaya', 'Putrajaya', 2.9180, 101.6902, 0, 'A lakeside monument marking Malaysia''s story.'),
    ('putrajaya-precinct-15', 'Taman Warisan Pertanian', 'taman-warisan-pertanian', 'Putrajaya', 'Putrajaya', 2.9012, 101.6715, 0, 'A living garden of Malaysian crops and heritage.'),
    ('putrajaya-precinct-15', 'Tuanku Mizan Zainal Abidin Mosque', 'tuanku-mizan-mosque', 'Putrajaya', 'Putrajaya', 2.9105, 101.6817, 0, 'The steel mosque by the Putrajaya waterfront.'),

    ('victoria-labuan', 'Labuan Museum', 'labuan-museum', 'Labuan', 'Victoria', 5.2749, 115.2411, 0, 'Island history in the centre of Victoria.'),
    ('victoria-labuan', 'Labuan Marine Museum', 'labuan-marine-museum', 'Labuan', 'Victoria', 5.2759, 115.2442, 0, 'Marine life and maritime stories from the island.'),
    ('victoria-labuan', 'Labuan War Cemetery', 'labuan-war-cemetery', 'Labuan', 'Victoria', 5.3054, 115.2264, 0, 'A quiet memorial garden beneath shady trees.'),
    ('victoria-labuan', 'Financial Park Labuan', 'financial-park-labuan', 'Labuan', 'Victoria', 5.2788, 115.2419, 0, 'The island''s modern commercial centre.'),
    ('pohon-batu', 'Labuan Peace Park', 'labuan-peace-park', 'Labuan', 'Pohon Batu', 5.3018, 115.1662, 0, 'A coastal memorial park with open sea views.'),
    ('pohon-batu', 'Surrender Point Labuan', 'surrender-point-labuan', 'Labuan', 'Pohon Batu', 5.3013, 115.1653, 0, 'A historic shoreline and remembrance site.'),
    ('sungai-labu', 'Chimney Museum Labuan', 'chimney-museum-labuan', 'Labuan', 'Sungai Labu', 5.3284, 115.2237, 0, 'An island landmark tied to its coal-mining past.'),
    ('sungai-labu', 'Batu Manikar Beach', 'batu-manikar-beach', 'Labuan', 'Sungai Labu', 5.3250, 115.1743, 0, 'A broad beach for a quiet island sunset.'),
    ('layang-layang-labuan', 'Layang-Layang Beach', 'layang-layang-beach-labuan', 'Labuan', 'Layang-Layang', 5.2377, 115.1930, 0, 'A long shoreline with shallow island water.'),
    ('layang-layang-labuan', 'Papan Island', 'papan-island', 'Labuan', 'Layang-Layang', 5.2561, 115.1706, 0, 'A small marine escape just off Labuan.' )
)
INSERT INTO places (
  id, parent_id, level, name, slug, state, district, lat, lng, entry_fee, tagline
)
SELECT
  md5('federal-territories:poi:' || poi_values.slug)::uuid,
  regions.id,
  'poi',
  poi_values.name,
  poi_values.slug,
  poi_values.state,
  poi_values.district,
  poi_values.lat,
  poi_values.lng,
  poi_values.entry_fee,
  poi_values.tagline
FROM poi_values
JOIN places regions ON regions.slug = poi_values.region_slug
ON CONFLICT (slug) DO NOTHING;

-- Existing Kuala Lumpur activities are place-bound. The conditional SELECT
-- keeps this migration safe for reduced demo catalogues that do not contain
-- one of these products.
INSERT INTO product_places (product_id, place_id, relation_type)
SELECT products.id, places.id, links.relation_type
FROM (
  VALUES
    ('03db72a4-dc49-4278-a44d-22e1e161b5eb'::uuid, 'bukit-nanas-forest-reserve', 'guide_service'),
    ('2846fe3d-6f01-413b-a0b1-af6e9d3fe9a0'::uuid, 'dataran-merdeka', 'guide_service')
) AS links(product_id, place_slug, relation_type)
JOIN products ON products.id = links.product_id
JOIN places ON places.slug = links.place_slug
ON CONFLICT (product_id, place_id) DO NOTHING;

DO $$
DECLARE
  state_count integer;
  region_count integer;
  poi_count integer;
BEGIN
  SELECT count(*) INTO state_count
  FROM places
  WHERE level = 'state'
    AND slug IN ('kuala-lumpur', 'putrajaya', 'labuan');
  IF state_count <> 3 THEN
    RAISE EXCEPTION 'expected 3 federal territory states, found %', state_count;
  END IF;

  SELECT count(*) INTO region_count
  FROM places
  WHERE level = 'region'
    AND state IN ('Kuala Lumpur', 'Putrajaya', 'Labuan');
  IF region_count <> 12 THEN
    RAISE EXCEPTION 'expected 12 federal territory regions, found %', region_count;
  END IF;

  SELECT count(*) INTO poi_count
  FROM places
  WHERE level = 'poi'
    AND state IN ('Kuala Lumpur', 'Putrajaya', 'Labuan');
  IF poi_count <> 30 THEN
    RAISE EXCEPTION 'expected 30 federal territory POIs, found %', poi_count;
  END IF;
END $$;

COMMIT;
;
