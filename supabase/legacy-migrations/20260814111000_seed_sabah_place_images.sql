-- Sabah place imagery — see
-- docs/plans/2026-08-14-1650-sabah-real-business-seed.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260814110000_seed_sabah.sql.
--
-- 13 of 14 candidate slugs (4 regions + 10 POIs) got a usable photo; the
-- state row reuses the Kota Kinabalu region photo (same pattern as
-- Pahang/Perlis's state row reusing a regional asset).
--
-- One genuine gap — no usable Commons photo found for pusat-orkid (KK
-- Orchid Centre); every search returned unrelated botanical-journal PDFs
-- and an unrelated orchid species photo with no location tie. Keeps
-- image_url NULL and falls back to the initial-letter colour block.
--
-- tanjung-aru (region) and tanjung-aru-beach (POI) are both sunset beach
-- shots but genuinely distinct photographs (one framed with foreground
-- silhouettes and a palm frond, the other open water with distant island
-- silhouettes) — same precedent as Perlis's kaki-bukit/gua-kelam pair, not
-- a near-duplicate.
--
-- First Mari Mari Cultural Village pick ("... - 10.jpg") turned out to be
-- an unusably dark night shot of two kettles on a cooking fire — replaced
-- with "... - 9.jpg", which clearly shows staff in traditional dress at a
-- cultural demonstration.
--
-- Fetched via api.wikimedia.org's REST file endpoint throughout (per the
-- Kedah/Perlis lesson) — no rate-limit hits this pass.
--
-- Attribution per file:
--
--   kota-kinabalu.webp             KotaKinabalu CityHall.jpg — CC BY-SA 4.0
--   ranau.webp                     Ranau Sabah Ranau-Plain-from-Kompleks-Sukan-01.jpg — CC BY-SA 4.0
--   tuaran.webp                    Tuaran Sabah Roundabout-Kuda-Tuaran-01.jpg — CC BY-SA 4.0
--   tanjung-aru.webp                Tanjung Aru.JPG — CC BY-SA 3.0
--   kinabalu-park.webp             Rocky Stairs to Mount Kinabalu Summit.jpg — CC BY-SA 4.0
--   sabah-state-museum.webp        KotaKinabalu Sabah Sabah-State-Museum-01.jpg — CC BY-SA 4.0
--   signal-hill-observatory.webp   Signal Hill Observatory, Kota Kinabalu, Malaysia.JPG — CC BY-SA 3.0
--   gaya-street-market.webp        Gaya Street Sunday Market, 2024 (09).jpg — CC BY-SA 4.0
--   jesselton-point.webp           KotaKinabalu Sabah JesseltonPoint-01.jpg — CC BY-SA 4.0
--   kk-city-mosque.webp            Kota Kinabalu City Mosque 01.jpg — CC BY-SA 4.0
--   mari-mari-cultural-village.webp Mari Mari Cultural Village - 9.jpg — CC BY-SA 4.0
--   tanjung-aru-beach.webp         Sunset At Tanjung Aru Beach.jpg — CC BY-SA 4.0
--   tar-marine-park.webp           Pulau Manukan, Kota Kinabalu, Sabah, Borneo.jpg — CC BY-SA 4.0

BEGIN;

UPDATE places SET image_url = '/assets/customer/sabah/kota-kinabalu.webp' WHERE slug = 'sabah';
UPDATE places SET image_url = '/assets/customer/sabah/kota-kinabalu.webp' WHERE slug = 'kota-kinabalu';
UPDATE places SET image_url = '/assets/customer/sabah/ranau.webp' WHERE slug = 'ranau';
UPDATE places SET image_url = '/assets/customer/sabah/tuaran.webp' WHERE slug = 'tuaran';
UPDATE places SET image_url = '/assets/customer/sabah/tanjung-aru.webp' WHERE slug = 'tanjung-aru';

UPDATE places SET image_url = '/assets/customer/sabah/kinabalu-park.webp' WHERE slug = 'kinabalu-park';
UPDATE places SET image_url = '/assets/customer/sabah/sabah-state-museum.webp' WHERE slug = 'sabah-state-museum';
UPDATE places SET image_url = '/assets/customer/sabah/signal-hill-observatory.webp' WHERE slug = 'signal-hill-observatory';
UPDATE places SET image_url = '/assets/customer/sabah/gaya-street-market.webp' WHERE slug = 'gaya-street-market';
UPDATE places SET image_url = '/assets/customer/sabah/jesselton-point.webp' WHERE slug = 'jesselton-point';
UPDATE places SET image_url = '/assets/customer/sabah/kk-city-mosque.webp' WHERE slug = 'kk-city-mosque';
UPDATE places SET image_url = '/assets/customer/sabah/mari-mari-cultural-village.webp' WHERE slug = 'mari-mari-cultural-village';
UPDATE places SET image_url = '/assets/customer/sabah/tanjung-aru-beach.webp' WHERE slug = 'tanjung-aru-beach';
UPDATE places SET image_url = '/assets/customer/sabah/tar-marine-park.webp' WHERE slug = 'tar-marine-park';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Sabah' AND image_url IS NOT NULL;
  IF n <> 14 THEN RAISE EXCEPTION 'expected 14 Sabah places with an image, found %', n; END IF;
END $$;

COMMIT;
