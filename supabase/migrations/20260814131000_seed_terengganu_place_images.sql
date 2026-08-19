-- Terengganu place imagery — see
-- docs/plans/2026-08-14-1830-terengganu-real-business-seed.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260814130000_seed_terengganu.sql.
--
-- Corrective substitution: 'Kampung Cina Bridge' had zero Commons coverage
-- under every search term tried. It is renamed here to 'Kuala Terengganu
-- Drawbridge' — the real, iconic bascule bridge (Jambatan Angkat) at the
-- Terengganu river mouth, a much better-known landmark. It has no
-- product_places dependency, so the rename is a clean swap, not a
-- data-integrity risk — same pattern as Sarawak's Kuching Sign -> Kuching
-- Cat Statue fix.
--
-- 3 of 13 remaining candidate slugs got no usable photo — merang (region),
-- merang-jetty and turtle-alley all returned zero on-subject results
-- (Merang's own search surfaced only "jamur merang", a straw-mushroom
-- name collision unrelated to the town). All three keep image_url NULL
-- and fall back to the initial-letter colour block.
--
-- pulau-wan-man (region) and masjid-kristal (POI) both show Masjid
-- Kristal but are genuinely distinct photographs — a wide aerial shot
-- including the river bridge and city skyline, versus a ground-level
-- close-up of the domes — same precedent as Sabah's tanjung-aru pair and
-- Sarawak's semenggoh pair, not a near-duplicate.
--
-- Attribution per file:
--
--   kuala-terengganu.webp         Kuala Terengganu, City centre, Malaysia.jpg — CC BY-SA 4.0
--   pulau-wan-man.webp            Crystal Mosque Aerial Shot 1.jpg — CC BY-SA 4.0
--   pasar-payang.webp             Pasar Besar Kedai Payang Terengganu.JPG — CC BY-SA 4.0
--   chinatown-gate.webp           Chinatown Gate, Kuala Terengganu.jpg — CC BY-SA 4.0
--   water-front.webp              Kuala Terengganu Waterfront, Kuala Terengganu 20240227 124551.jpg — CC BY-SA 4.0
--   terengganu-state-museum.webp  The main entrance of Terengganu State Museum.jpg — CC BY-SA 4.0
--   masjid-kristal.webp           Terengganu crystal mosque.jpg — CC BY-SA 3.0
--   taman-tamadun-islam.webp      Masjid Sultan Omar Ali Saifudin di Taman Tamadun Islam.jpg — CC BY-SA 3.0
--   pulau-redang.webp             Pulau Redang - White sandy beach.jpg — CC BY-SA 4.0
--   kt-drawbridge.webp            Kuala Terengganu Drawbridge.jpg — CC BY-SA 4.0

BEGIN;

UPDATE places
SET name = 'Kuala Terengganu Drawbridge', slug = 'kt-drawbridge'
WHERE state = 'Terengganu' AND slug = 'kampung-cina-bridge';

UPDATE places SET image_url = '/assets/customer/terengganu/kuala-terengganu.webp' WHERE slug = 'terengganu';
UPDATE places SET image_url = '/assets/customer/terengganu/kuala-terengganu.webp' WHERE slug = 'kuala-terengganu';
UPDATE places SET image_url = '/assets/customer/terengganu/pulau-wan-man.webp' WHERE slug = 'pulau-wan-man';

UPDATE places SET image_url = '/assets/customer/terengganu/pasar-payang.webp' WHERE slug = 'pasar-payang';
UPDATE places SET image_url = '/assets/customer/terengganu/chinatown-gate.webp' WHERE slug = 'chinatown-gate';
UPDATE places SET image_url = '/assets/customer/terengganu/water-front.webp' WHERE slug = 'water-front';
UPDATE places SET image_url = '/assets/customer/terengganu/terengganu-state-museum.webp' WHERE slug = 'terengganu-state-museum';
UPDATE places SET image_url = '/assets/customer/terengganu/kt-drawbridge.webp' WHERE slug = 'kt-drawbridge';
UPDATE places SET image_url = '/assets/customer/terengganu/masjid-kristal.webp' WHERE slug = 'masjid-kristal';
UPDATE places SET image_url = '/assets/customer/terengganu/taman-tamadun-islam.webp' WHERE slug = 'taman-tamadun-islam';
UPDATE places SET image_url = '/assets/customer/terengganu/pulau-redang.webp' WHERE slug = 'pulau-redang';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Terengganu' AND image_url IS NOT NULL;
  IF n <> 11 THEN RAISE EXCEPTION 'expected 11 Terengganu places with an image, found %', n; END IF;
END $$;

COMMIT;
