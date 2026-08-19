-- Perak place imagery — see
-- docs/plans/2026-08-14-2000-perak-real-business-seed.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260814150000_seed_perak.sql.
--
-- Corrective substitution: 'Kong Heng Square' had zero Commons coverage
-- under every search term tried. It is renamed here to 'Concubine Lane' —
-- the real, well-documented heritage shophouse lane immediately adjacent,
-- part of the same old-town Ipoh heritage-market precinct. The existing
-- `addon` product_places link (Lam Fong Biscuit House) is preserved as-is:
-- the place id is unchanged, only the name/slug are updated, so the
-- heritage-biscuit-shop-near-heritage-lane relationship still reads
-- correctly. Same pattern as Sarawak's Kuching Sign -> Kuching Cat Statue
-- and Terengganu's Kampung Cina Bridge -> Kuala Terengganu Drawbridge.
--
-- 1 of 13 candidate slugs got no usable photo — Taiping Zoo & Night Safari
-- returned only animal/species information-board photos under every
-- search term tried, none of which depict the zoo grounds themselves. It
-- keeps image_url NULL and falls back to the initial-letter colour block.
-- No further substitution needed: 12/13 candidates found clears the 75%
-- coverage threshold comfortably.
--
-- Attribution per file:
--
--   ipoh.webp                        Ipoh, The Capital City of the Malaysian State of Perak.jpg — CC BY-SA 4.0
--   taiping.webp                     Taiping-night-view.jpg — CC BY-SA 4.0
--   batu-gajah.webp                  Batu Gajah.JPG — CC BY-SA 4.0
--   ipoh-railway-station.webp        KTMB Ipoh Railway Station.jpg — CC BY-SA 4.0
--   birch-memorial-clock-tower.webp  Birch Memorial Clock Tower.jpg — CC BY-SA 4.0
--   sam-poh-tong-temple.webp         Sam Poh Tong Temple.jpg — CC BY-SA 4.0
--   concubine-lane.webp              Concubine Lane.jpg — Public domain
--   lost-world-of-tambun.webp        Lost Word of Tambun Main Entrance.JPG — CC BY-SA 4.0
--   taiping-lake-garden.webp         Taman Tasik Taiping 1.jpg — CC BY-SA 3.0
--   taiping-clock-tower.webp         Taiping Clock Tower.jpg — CC BY-SA 4.0
--   kellies-castle.webp              Kellie's Castle.jpg — CC BY 3.0
--   gopeng-museum.webp               Heritage House, Gopeng 懐古楼 - panoramio.jpg — CC BY-SA 3.0

BEGIN;

UPDATE places
SET name = 'Concubine Lane', slug = 'concubine-lane'
WHERE state = 'Perak' AND slug = 'kong-heng-square';

UPDATE places SET image_url = '/assets/customer/perak/ipoh.webp' WHERE slug = 'perak';
UPDATE places SET image_url = '/assets/customer/perak/ipoh.webp' WHERE slug = 'ipoh';
UPDATE places SET image_url = '/assets/customer/perak/taiping.webp' WHERE slug = 'taiping';
UPDATE places SET image_url = '/assets/customer/perak/batu-gajah.webp' WHERE slug = 'batu-gajah';

UPDATE places SET image_url = '/assets/customer/perak/ipoh-railway-station.webp' WHERE slug = 'ipoh-railway-station';
UPDATE places SET image_url = '/assets/customer/perak/birch-memorial-clock-tower.webp' WHERE slug = 'birch-memorial-clock-tower';
UPDATE places SET image_url = '/assets/customer/perak/sam-poh-tong-temple.webp' WHERE slug = 'sam-poh-tong-temple';
UPDATE places SET image_url = '/assets/customer/perak/concubine-lane.webp' WHERE slug = 'concubine-lane';
UPDATE places SET image_url = '/assets/customer/perak/lost-world-of-tambun.webp' WHERE slug = 'lost-world-of-tambun';
UPDATE places SET image_url = '/assets/customer/perak/taiping-lake-garden.webp' WHERE slug = 'taiping-lake-garden';
UPDATE places SET image_url = '/assets/customer/perak/taiping-clock-tower.webp' WHERE slug = 'taiping-clock-tower';
UPDATE places SET image_url = '/assets/customer/perak/kellies-castle.webp' WHERE slug = 'kellies-castle';
UPDATE places SET image_url = '/assets/customer/perak/gopeng-museum.webp' WHERE slug = 'gopeng-museum';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Perak' AND image_url IS NOT NULL;
  IF n <> 13 THEN RAISE EXCEPTION 'expected 13 Perak places with an image, found %', n; END IF;
END $$;

COMMIT;
