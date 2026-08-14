-- Sarawak place imagery — see
-- docs/plans/2026-08-14-1730-sarawak-real-business-seed.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260814120000_seed_sarawak.sql.
--
-- Corrective substitution: 'Kuching Sign' had zero Commons coverage under
-- every search term tried, unlike every other Sarawak POI this session —
-- it is renamed here to 'Kuching Cat Statue' (Kuching's real, iconic North
-- City Council roundabout landmark; the city's name means "cat" in Malay).
-- It has no product_places dependency, so the rename is a clean swap, not
-- a data-integrity risk. This keeps Sarawak's real-imagery coverage above
-- the 75% threshold instead of leaving an unphotographable POI in place.
--
-- 3 of 13 remaining candidate slugs got no usable photo — satok-market,
-- upside-down-house and kuching-waterfront-bazaar all returned either
-- zero results or vintage/archival-only photos (a 1930s steamroller scene,
-- a sepia riverfront) that would misrepresent the present-day place. Both
-- keep image_url NULL and fall back to the initial-letter colour block.
--
-- santubong-national-park's first pick ("Wetlands from santubong
-- Summit.JPG") had a person prominently in frame; replaced with a cleaner
-- aerial landscape shot of the same wetlands.
--
-- semenggoh (region) and semenggoh-wildlife-centre (POI) both show
-- orangutans but are genuinely distinct photographs (wide rope-swing shot
-- vs. close tree-branch portrait) — same precedent as Sabah's
-- tanjung-aru/tanjung-aru-beach pair, not a near-duplicate.
--
-- Attribution per file:
--
--   kuching.webp                    Kuching Waterfront Panorama.jpg — CC BY-SA 4.0
--   semenggoh.webp                  Wild Grace in The Canopy.jpg — CC BY-SA 4.0
--   santubong.webp                  Mount Santubong and Sarawak River, Malaysia.JPG — CC BY-SA 3.0
--   fort-margherita.webp            Fort Margherita Kuching.JPG — CC BY-SA 3.0
--   bishops-house.webp              Bishop's House.jpg — CC BY-SA 4.0
--   waterfront-lightshow.webp       Kuching Waterfront at night (15834807985).jpg — CC BY-SA 2.0
--   kuching-cat-statue.webp         Kuching Cat Statue (July 2024).jpg — CC BY-SA 4.0
--   semenggoh-wildlife-centre.webp  Orangutan-semenggoh.jpg — CC BY-SA 3.0
--   santubong-national-park.webp    Salak River, part of Kuching Wetlands National Park, and Mount Santubong.jpg — CC BY-SA 4.0
--   gunung-santubong.webp           Gunung Santubong Summit Trail, Sarawak.jpg — CC BY-SA 4.0

BEGIN;

UPDATE places
SET name = 'Kuching Cat Statue', slug = 'kuching-cat-statue'
WHERE state = 'Sarawak' AND slug = 'kuching-sign';

UPDATE places SET image_url = '/assets/customer/sarawak/kuching.webp' WHERE slug = 'sarawak';
UPDATE places SET image_url = '/assets/customer/sarawak/kuching.webp' WHERE slug = 'kuching';
UPDATE places SET image_url = '/assets/customer/sarawak/semenggoh.webp' WHERE slug = 'semenggoh';
UPDATE places SET image_url = '/assets/customer/sarawak/santubong.webp' WHERE slug = 'santubong';

UPDATE places SET image_url = '/assets/customer/sarawak/fort-margherita.webp' WHERE slug = 'fort-margherita';
UPDATE places SET image_url = '/assets/customer/sarawak/bishops-house.webp' WHERE slug = 'bishops-house';
UPDATE places SET image_url = '/assets/customer/sarawak/waterfront-lightshow.webp' WHERE slug = 'waterfront-lightshow';
UPDATE places SET image_url = '/assets/customer/sarawak/kuching-cat-statue.webp' WHERE slug = 'kuching-cat-statue';
UPDATE places SET image_url = '/assets/customer/sarawak/semenggoh-wildlife-centre.webp' WHERE slug = 'semenggoh-wildlife-centre';
UPDATE places SET image_url = '/assets/customer/sarawak/santubong-national-park.webp' WHERE slug = 'santubong-national-park';
UPDATE places SET image_url = '/assets/customer/sarawak/gunung-santubong.webp' WHERE slug = 'gunung-santubong';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Sarawak' AND image_url IS NOT NULL;
  IF n <> 11 THEN RAISE EXCEPTION 'expected 11 Sarawak places with an image, found %', n; END IF;
END $$;

COMMIT;
