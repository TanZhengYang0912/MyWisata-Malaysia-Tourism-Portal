-- Selangor place imagery — see
-- docs/plans/2026-08-14-1930-selangor-real-business-seed.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260814140000_seed_selangor.sql.
--
-- 1 of 13 candidate slugs got no usable photo — Dataran Bunga Raya (Shah
-- Alam's Hibiscus Square) returned zero on-subject results under every
-- search term tried. It keeps image_url NULL and falls back to the
-- initial-letter colour block. No corrective substitution needed: 12/13
-- candidates found clears the 75% coverage threshold comfortably.
--
-- Attribution per file:
--
--   klang.webp                       Klang Town - panoramio.jpg — CC BY-SA 3.0
--   shah-alam.webp                   Shah Alam City Council (241031) 01.jpg — CC BY-SA 4.0
--   kuala-selangor.webp               Kuala Selangor Old Town (230409) 01.jpg — CC BY-SA 4.0
--   istana-alam-shah.webp             Istana Alam Shah - panoramio.jpg — CC BY-SA 3.0
--   kota-raja-mahadi.webp             Kota Raja Mahadi.jpg — CC BY 4.0
--   little-india-klang.webp           Klang little india.jpg — CC0
--   blue-mosque.webp                  Masjid Sultan Salahudin Abdul Aziz Shah Alam Malaysia (5384495109).jpg — CC BY 2.0
--   shah-alam-lake-gardens.webp       Jambatan Kanopi, Taman Tasik Shah Alam (190812-1509).jpg — CC BY-SA 4.0
--   bukit-melawati.webp               Bukit Melawati Lighthouse.jpg — CC BY-SA 4.0
--   taman-alam-kuala-selangor.webp    Kuala Selangor Nature Park (230319) 01.jpg — CC BY-SA 4.0
--   pekan-lama-kuala-selangor.webp    Pekan Lama Kuala Selangor signboard (230316).jpg — CC BY-SA 4.0
--   kuala-selangor-history-museum.webp Kuala Selangor District Historical Museum (230319).jpg — CC BY-SA 4.0

BEGIN;

UPDATE places SET image_url = '/assets/customer/selangor/shah-alam.webp' WHERE slug = 'selangor';
UPDATE places SET image_url = '/assets/customer/selangor/klang.webp' WHERE slug = 'klang';
UPDATE places SET image_url = '/assets/customer/selangor/shah-alam.webp' WHERE slug = 'shah-alam';
UPDATE places SET image_url = '/assets/customer/selangor/kuala-selangor.webp' WHERE slug = 'kuala-selangor';

UPDATE places SET image_url = '/assets/customer/selangor/istana-alam-shah.webp' WHERE slug = 'istana-alam-shah';
UPDATE places SET image_url = '/assets/customer/selangor/kota-raja-mahadi.webp' WHERE slug = 'kota-raja-mahadi';
UPDATE places SET image_url = '/assets/customer/selangor/little-india-klang.webp' WHERE slug = 'little-india-klang';
UPDATE places SET image_url = '/assets/customer/selangor/blue-mosque.webp' WHERE slug = 'blue-mosque';
UPDATE places SET image_url = '/assets/customer/selangor/shah-alam-lake-gardens.webp' WHERE slug = 'shah-alam-lake-gardens';
UPDATE places SET image_url = '/assets/customer/selangor/bukit-melawati.webp' WHERE slug = 'bukit-melawati';
UPDATE places SET image_url = '/assets/customer/selangor/taman-alam-kuala-selangor.webp' WHERE slug = 'taman-alam-kuala-selangor';
UPDATE places SET image_url = '/assets/customer/selangor/pekan-lama-kuala-selangor.webp' WHERE slug = 'pekan-lama-kuala-selangor';
UPDATE places SET image_url = '/assets/customer/selangor/kuala-selangor-history-museum.webp' WHERE slug = 'kuala-selangor-history-museum';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Selangor' AND image_url IS NOT NULL;
  IF n <> 13 THEN RAISE EXCEPTION 'expected 13 Selangor places with an image, found %', n; END IF;
END $$;

COMMIT;
;
