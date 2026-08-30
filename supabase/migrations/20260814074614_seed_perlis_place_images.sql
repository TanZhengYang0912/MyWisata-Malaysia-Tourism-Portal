-- Perlis place imagery — see
-- docs/plans/2026-08-14-1610-perlis-real-business-seed.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260814100000_seed_perlis.sql.
--
-- 6 of 8 candidate slugs (3 regions + 5 POIs) got a usable photo; the
-- state row reuses the Kangar street photo (same pattern as Pahang's state
-- row reusing a regional asset).
--
-- Two genuine gaps — no usable Commons photo found under several search
-- terms. Both keep image_url NULL and fall back to the initial-letter
-- colour block in PlaceCard:
--   dataran-keris — no Commons coverage of Kangar's keris monument square
--     under any search term tried.
--   taman-ular-dan-reptilia — no Commons coverage of the Kangar snake and
--     reptile park.
--
-- kaki-bukit (region) and gua-kelam (POI) both show the Gua Kelam cave
-- complex but are genuinely distinct photographs — an interior
-- coloured-light walkway shot versus an exterior signed entrance shot —
-- same precedent as Kedah's kilim / kilim-geoforest-park pair.
--
-- Learned from Kedah's imagery pass: fetched directly via
-- api.wikimedia.org's REST file endpoint (`preferred` thumbnail URL)
-- instead of the raw upload.wikimedia.org originals, avoiding the 429
-- rate limit hit there.
--
-- Attribution per file:
--
--   kangar.webp                       Kangar (2019).jpg — CC BY-SA 4.0
--   kaki-bukit.webp                   The Cave of Darkness, Gua Kelam, Perlis, Malaysia (4675879917).jpg — CC BY 2.0
--   padang-besar.webp                 Padang Besar, Perlis, Malaysia - panoramio.jpg — CC BY 3.0
--   gua-kelam.webp                    Gua Kelam - Perlis, Malaysia.jpg — CC BY-SA 4.0
--   wang-kelian-viewpoint.webp        Wang Kelian Checkpoint.jpg — CC BY-SA 4.0
--   padang-besar-border-bazaar.webp   Arked Niaga Padang Besar, Padang Besar 20231224 114902.jpg — CC BY-SA 4.0

BEGIN;

UPDATE places SET image_url = '/assets/customer/perlis/kangar.webp' WHERE slug = 'perlis';
UPDATE places SET image_url = '/assets/customer/perlis/kangar.webp' WHERE slug = 'kangar';
UPDATE places SET image_url = '/assets/customer/perlis/kaki-bukit.webp' WHERE slug = 'kaki-bukit';
UPDATE places SET image_url = '/assets/customer/perlis/padang-besar.webp' WHERE slug = 'padang-besar';

UPDATE places SET image_url = '/assets/customer/perlis/gua-kelam.webp' WHERE slug = 'gua-kelam';
UPDATE places SET image_url = '/assets/customer/perlis/wang-kelian-viewpoint.webp' WHERE slug = 'wang-kelian-viewpoint';
UPDATE places SET image_url = '/assets/customer/perlis/padang-besar-border-bazaar.webp' WHERE slug = 'padang-besar-border-bazaar';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Perlis' AND image_url IS NOT NULL;
  IF n <> 7 THEN RAISE EXCEPTION 'expected 7 Perlis places with an image, found %', n; END IF;
END $$;

COMMIT;
;
