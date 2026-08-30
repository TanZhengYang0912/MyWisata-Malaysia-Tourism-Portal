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
;
