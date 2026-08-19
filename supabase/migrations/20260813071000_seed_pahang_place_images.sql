-- Pahang place imagery — see
-- docs/plans/2026-08-13-0106-pahang-place-seed-and-imagery.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260813070000_seed_pahang.sql.
--
-- 21 of 28 places got a usable photo — at the high end of the plan's own
-- §4.4 estimate (20-22 of 28).
--
-- cherating and cherating-beach were both searched and both returned the
-- same lifeguard-tower-and-palm-trees shot from two search terms; per
-- §4.2's explicit near-duplicate rule, only cherating.webp is used and
-- cherating-beach keeps image_url NULL rather than shipping a duplicate.
--
-- No usable Commons photo was found for these 6 — they keep image_url NULL
-- and fall back to the initial-letter colour block in PlaceCard:
--   sungai-palas-tea-estate, juara-beach, tioman-marine-park,
--   cherating-turtle-sanctuary, bishops-trail, lata-berkoh
--
-- Attribution per file:
--
--   asah-waterfall.webp             Asah Waterfall.jpg — CC BY-SA 2.0
--   bukit-teresek.webp               View from Bukit Teresek, North.jpg — CC BY 4.0
--   cameron-highlands.webp           Cameron Bharat Tea Plantation, Cameron Highlands, Malaysia, 20250829 1424 4026.jpg — CC BY 4.0
--   canopy-walkway.webp              Canopy walkway at Taman Negara.jpg — CC BY-SA 4.0
--   cherating.webp                   Cherating, Malaysia, Cherating Beach.jpg — CC BY 4.0
--   chin-swee-caves-temple.webp      Chin Swee Caves Temple, Malaysia.jpg — CC0
--   frasers-hill.webp                View of Titiwangsa range from Fraser's Hill 3.jpg — CC BY-SA 4.0 (via search)
--   frasers-hill-clock-tower.webp    Fraser's Hill Clock Tower.JPG — CC BY-SA 3.0
--   genting-highlands.webp           Genting Highlands and Genting Grand (230918).jpg — CC BY-SA 4.0
--   genting-skyway.webp              Genting Highlands Cable Car，云顶缆车.jpg — CC BY-SA 2.0
--   gua-charas.webp                  Gua Charas, Pahang.jpg — CC BY-SA 4.0
--   kuantan.webp                     Jalan Besar Kuantan 1.jpg — CC BY-SA 4.0
--   mossy-forest.webp                Big Mossy Tree at Mossy Forest, Cameron Highlands.jpg — CC BY-SA 4.0
--   rafflesia-trail.webp             Rafflesia flower - Cameron Highlands - Malaysia - panoramio.jpg — CC BY-SA 3.0
--   rainbow-waterfall.webp           Pahang Kuantan Sungai Lembing Rainbow Waterfall.jpg — CC BY-SA 4.0
--   sungai-lembing.webp              Sungai Lembing Town.jpg — CC BY-SA 4.0
--   sungai-pandan-waterfall.webp     Air terjun Sungai Pandan (1) – TER Sg. Pandan, Kuantan IMG20250727.jpg — CC0
--   taman-negara.webp                Taman Negara, Malaysia, Panoramic view.jpg — CC BY 4.0
--   teluk-cempedak-beach.webp        Kuantan - rocks on the beach at Teluk Cempedak - May 2024.jpg — CC BY-SA 4.0
--   tin-mine-museum.webp             Sungai Lembing Museum October 2011.jpg — CC0
--   tioman-island.webp               Pulau Tioman (1).jpg — CC BY-SA 4.0

BEGIN;

UPDATE places SET image_url = '/assets/customer/pahang/cameron-highlands.webp' WHERE slug = 'cameron-highlands';
UPDATE places SET image_url = '/assets/customer/pahang/genting-highlands.webp' WHERE slug = 'genting-highlands';
UPDATE places SET image_url = '/assets/customer/pahang/frasers-hill.webp' WHERE slug = 'frasers-hill';
UPDATE places SET image_url = '/assets/customer/pahang/kuantan.webp' WHERE slug = 'kuantan';
UPDATE places SET image_url = '/assets/customer/pahang/cherating.webp' WHERE slug = 'cherating';
UPDATE places SET image_url = '/assets/customer/pahang/taman-negara.webp' WHERE slug = 'taman-negara';
UPDATE places SET image_url = '/assets/customer/pahang/tioman-island.webp' WHERE slug = 'tioman-island';
UPDATE places SET image_url = '/assets/customer/pahang/sungai-lembing.webp' WHERE slug = 'sungai-lembing';

UPDATE places SET image_url = '/assets/customer/pahang/rafflesia-trail.webp' WHERE slug = 'rafflesia-trail';
UPDATE places SET image_url = '/assets/customer/pahang/mossy-forest.webp' WHERE slug = 'mossy-forest';
UPDATE places SET image_url = '/assets/customer/pahang/chin-swee-caves-temple.webp' WHERE slug = 'chin-swee-caves-temple';
UPDATE places SET image_url = '/assets/customer/pahang/genting-skyway.webp' WHERE slug = 'genting-skyway';
UPDATE places SET image_url = '/assets/customer/pahang/frasers-hill-clock-tower.webp' WHERE slug = 'frasers-hill-clock-tower';
UPDATE places SET image_url = '/assets/customer/pahang/teluk-cempedak-beach.webp' WHERE slug = 'teluk-cempedak-beach';
UPDATE places SET image_url = '/assets/customer/pahang/gua-charas.webp' WHERE slug = 'gua-charas';
UPDATE places SET image_url = '/assets/customer/pahang/sungai-pandan-waterfall.webp' WHERE slug = 'sungai-pandan-waterfall';
UPDATE places SET image_url = '/assets/customer/pahang/canopy-walkway.webp' WHERE slug = 'canopy-walkway';
UPDATE places SET image_url = '/assets/customer/pahang/bukit-teresek.webp' WHERE slug = 'bukit-teresek';
UPDATE places SET image_url = '/assets/customer/pahang/asah-waterfall.webp' WHERE slug = 'asah-waterfall';
UPDATE places SET image_url = '/assets/customer/pahang/rainbow-waterfall.webp' WHERE slug = 'rainbow-waterfall';
UPDATE places SET image_url = '/assets/customer/pahang/tin-mine-museum.webp' WHERE slug = 'tin-mine-museum';

-- 22, not 21: the state row's image_url was already set in the Phase 1 seed
-- (D12 reuses /assets/customer/malaysia/pahang-cameron-highlands.webp).
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Pahang' AND image_url IS NOT NULL;
  IF n <> 22 THEN RAISE EXCEPTION 'expected 22 Pahang places with an image, found %', n; END IF;
END $$;

COMMIT;
