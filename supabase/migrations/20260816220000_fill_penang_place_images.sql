-- Fill the three Penang place cards that previously rendered initial-letter
-- placeholders. Each place has its own real photograph; no image is reused.
-- The files are uploaded to the place-images bucket as:
--   penang/meromictic-lake.webp
--   penang/balik-pulau-durian-orchards.webp
--   penang/batu-ferringhi-night-market.webp
-- See public/assets/customer/penang/PHOTO-CREDITS.md for source and license
-- notes before promoting these demo assets to production.

BEGIN;

UPDATE places
SET image_url = 'penang/meromictic-lake.webp'
WHERE slug = 'meromictic-lake'
  AND image_url IS NULL;

UPDATE places
SET image_url = 'penang/balik-pulau-durian-orchards.webp'
WHERE slug = 'balik-pulau-durian-orchards'
  AND image_url IS NULL;

UPDATE places
SET image_url = 'penang/batu-ferringhi-night-market.webp'
WHERE slug = 'batu-ferringhi-night-market'
  AND image_url IS NULL;

COMMIT;
