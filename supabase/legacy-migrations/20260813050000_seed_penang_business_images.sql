-- Attach Wikimedia Commons photos to the landmark businesses and their flagship
-- products. See docs/plans/2026-08-13-1109-penang-real-business-reseed.md Task 4.
--
-- Only subjects with a genuine CC-licensed Commons photo are covered. Everything
-- else keeps cover_url NULL, which renders as the initial-letter colour block —
-- no stock substitutes.
--
-- Four of the six subjects already had the right photo in the repo from
-- 20260813010000_seed_penang_place_images.sql, so they are reused rather than
-- re-downloaded into a parallel vendors/ directory. penang-hill.webp is
-- literally a photo of the funicular railway, which is the product it backs.
-- Attribution for those four stays recorded in that migration's header.
--
-- Reused (attribution in 20260813010000_seed_penang_place_images.sql):
--   kek-lok-si-temple.webp          Penang Malaysia Kek-Lok-Si-Temple-01.jpg — CC BY-SA 3.0
--   penang-hill.webp                Penang Hill Funicular Railway - panoramio.jpg — CC BY-SA 3.0
--   khoo-kongsi.webp                Khoo Kongsi (I).jpg — CC BY 4.0
--   pinang-peranakan-mansion.webp   Pinang Peranakan Mansion, George Town, Penang.jpg — CC BY-SA 4.0
--
-- New in this migration:
--   eastern-oriental-hotel.webp     Eastern & Oriental Hotel - Penang.jpg — CC BY-SA 4.0
--   cheong-fatt-tze-mansion.webp    Cheong Fatt Tze Mansion (I).jpg — CC BY 4.0
--
-- No usable Commons photo was searched for or found for the food, retail and
-- activity vendors (Chendul, Ghee Hiang, Him Heang, Hameediyah, Line Clear,
-- Toh Soon, Gerakbudaya, Entopia, ESCAPE, Tropical Spice Garden, The Habitat,
-- Penang National Park, Penang Heritage Trust, Shangri-La Rasa Sayang) — those
-- are trading businesses whose Commons coverage is thin or absent, and a
-- generic streetscape would misrepresent them. They keep cover_url NULL.

BEGIN;

UPDATE products SET cover_url = '/assets/customer/penang/kek-lok-si-temple.webp'
  WHERE slug = 'kek-lok-si-entry';
UPDATE products SET cover_url = '/assets/customer/penang/penang-hill.webp'
  WHERE slug = 'penang-hill-funicular-return';
UPDATE products SET cover_url = '/assets/customer/penang/khoo-kongsi.webp'
  WHERE slug = 'khoo-kongsi-entry';
UPDATE products SET cover_url = '/assets/customer/penang/pinang-peranakan-mansion.webp'
  WHERE slug = 'peranakan-mansion-entry';
UPDATE products SET cover_url = '/assets/customer/penang/eastern-oriental-hotel.webp'
  WHERE slug = 'eo-heritage-wing-suite';
UPDATE products SET cover_url = '/assets/customer/penang/cheong-fatt-tze-mansion.webp'
  WHERE slug = 'blue-mansion-courtyard-room';

UPDATE vendors SET cover_url = '/assets/customer/penang/kek-lok-si-temple.webp'
  WHERE slug = 'kek-lok-si-temple-vendor';
UPDATE vendors SET cover_url = '/assets/customer/penang/penang-hill.webp'
  WHERE slug = 'penang-hill-corporation';
UPDATE vendors SET cover_url = '/assets/customer/penang/khoo-kongsi.webp'
  WHERE slug = 'khoo-kongsi-trust';
UPDATE vendors SET cover_url = '/assets/customer/penang/pinang-peranakan-mansion.webp'
  WHERE slug = 'pinang-peranakan-mansion-vendor';
UPDATE vendors SET cover_url = '/assets/customer/penang/eastern-oriental-hotel.webp'
  WHERE slug = 'eastern-oriental-hotel';
UPDATE vendors SET cover_url = '/assets/customer/penang/cheong-fatt-tze-mansion.webp'
  WHERE slug = 'cheong-fatt-tze-blue-mansion';

-- Post-condition: every statement above must have matched, or a slug drifted.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM products WHERE cover_url IS NOT NULL;
  IF n <> 6 THEN RAISE EXCEPTION 'expected 6 products with cover_url, got %', n; END IF;

  SELECT count(*) INTO n FROM vendors WHERE cover_url IS NOT NULL;
  IF n <> 6 THEN RAISE EXCEPTION 'expected 6 vendors with cover_url, got %', n; END IF;
END $$;

COMMIT;
