-- Johor place imagery — see
-- docs/plans/2026-08-14-1431-johor-real-business-seed.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260813080000_seed_johor.sql.
--
-- 17 of 20 candidate slugs (7 regions + 13 POIs) got a usable photo.
--
-- Two initial picks turned out to be the wrong subject after eyeballing,
-- same pattern as Melaka's and Pahang's imagery passes: the first
-- "Sultan Abu Bakar Mosque - Entrance Gate.jpg" candidate was actually a
-- Jawi-script road gate, not the mosque, so sultan-abu-bakar-mosque uses
-- "Sultan Abu Bakar State Mosque.jpg" instead; the first
-- "Johor Bahru City Square.JPG" candidate showed an unrelated clock tower,
-- so jb-city-square uses the confirmed mall-interior shot instead (its
-- "JB City Square" signage is visible in frame).
--
-- Two near-duplicates were found and only one kept per subject, per the
-- established near-duplicate rule: danga-bay and danga-bay-waterfront both
-- returned the same night funfair/Ferris-wheel shot from two searches —
-- danga-bay (region) keeps it, danga-bay-waterfront (POI) stays NULL. muar
-- (region) and muar-clock-tower (POI) are literally the same clock tower;
-- muar-clock-tower keeps the closer, title-matched shot and the muar region
-- hero stays NULL rather than ship a near-repeat.
--
-- No usable Commons photo exists for legoland-waterpark — searched directly
-- and via a broader retry, zero results either way.
--
-- Gaps (image_url stays NULL, colour block renders): muar (region),
-- danga-bay-waterfront, legoland-waterpark.
--
-- Attribution per file:
--
--   danga-bay.webp                Danga Bay, Johor.jpg — CC BY-SA 2.0
--   desaru.webp                   Desaru Beach.jpg — CC BY-SA 4.0
--   desaru-ostrich-farm.webp      Desaru Ostrich Farm.jpg — CC BY-SA 4.0
--   istana-bukit-serene.webp      Istana Bukit Serene - The Royal Crown (night, 2015).jpg — CC BY-SA 4.0
--   jb-city-square.webp           Johor Bahru City Square (shopping mall) 20241108 184254.jpg — CC BY-SA 4.0
--   johor-bahru.webp              Johor Bahru City.jpg — CC BY-SA 3.0
--   kota-tinggi.webp              Kota Tinggi Town Square.jpg — CC BY-SA 4.0
--   kota-tinggi-firefly-park.webp Kota Tinggi Firefly Park 01.jpg — CC BY-SA 4.0
--   kota-tinggi-waterfalls.webp   Kota Tinggi waterfalls - Flickr.jpg — CC BY-SA 2.0
--   legoland.webp                 Legoland Malaysia 2015 02.jpg — CC BY-SA 4.0
--   legoland-malaysia.webp        Entrance Legoland Malaysia.jpg — CC BY-SA 2.0
--   mersing.webp                  Mersing - Harbour Centre - May 2024.jpg — CC BY-SA 4.0
--   mersing-jetty.webp            Boarding-monitor-mersing-jetty.jpg — CC BY-SA 4.0
--   muar-clock-tower.webp         Muar Clock Tower.jpg — CC BY-SA 4.0
--   muzium-kota-tinggi.webp       Kota Tinggi Museum.JPG — CC BY-SA 4.0
--   sultan-abu-bakar-mosque.webp  Sultan Abu Bakar State Mosque.jpg — CC BY-SA 4.0 (corrected pick — see note above)
--   zoo-johor.webp                Zoo Johor entrance.jpg — CC BY-SA 4.0

BEGIN;

UPDATE places SET image_url = '/assets/customer/johor/johor-bahru.webp' WHERE slug = 'johor-bahru';
UPDATE places SET image_url = '/assets/customer/johor/danga-bay.webp' WHERE slug = 'danga-bay';
UPDATE places SET image_url = '/assets/customer/johor/legoland.webp' WHERE slug = 'legoland';
UPDATE places SET image_url = '/assets/customer/johor/kota-tinggi.webp' WHERE slug = 'kota-tinggi';
UPDATE places SET image_url = '/assets/customer/johor/mersing.webp' WHERE slug = 'mersing';
UPDATE places SET image_url = '/assets/customer/johor/desaru.webp' WHERE slug = 'desaru';

UPDATE places SET image_url = '/assets/customer/johor/sultan-abu-bakar-mosque.webp' WHERE slug = 'sultan-abu-bakar-mosque';
UPDATE places SET image_url = '/assets/customer/johor/zoo-johor.webp' WHERE slug = 'zoo-johor';
UPDATE places SET image_url = '/assets/customer/johor/jb-city-square.webp' WHERE slug = 'jb-city-square';
UPDATE places SET image_url = '/assets/customer/johor/istana-bukit-serene.webp' WHERE slug = 'istana-bukit-serene';
UPDATE places SET image_url = '/assets/customer/johor/legoland-malaysia.webp' WHERE slug = 'legoland-malaysia';
UPDATE places SET image_url = '/assets/customer/johor/kota-tinggi-waterfalls.webp' WHERE slug = 'kota-tinggi-waterfalls';
UPDATE places SET image_url = '/assets/customer/johor/kota-tinggi-firefly-park.webp' WHERE slug = 'kota-tinggi-firefly-park';
UPDATE places SET image_url = '/assets/customer/johor/muzium-kota-tinggi.webp' WHERE slug = 'muzium-kota-tinggi';
UPDATE places SET image_url = '/assets/customer/johor/muar-clock-tower.webp' WHERE slug = 'muar-clock-tower';
UPDATE places SET image_url = '/assets/customer/johor/mersing-jetty.webp' WHERE slug = 'mersing-jetty';
UPDATE places SET image_url = '/assets/customer/johor/desaru-ostrich-farm.webp' WHERE slug = 'desaru-ostrich-farm';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Johor' AND image_url IS NOT NULL;
  IF n <> 17 THEN RAISE EXCEPTION 'expected 17 Johor places with an image, found %', n; END IF;
END $$;

COMMIT;
