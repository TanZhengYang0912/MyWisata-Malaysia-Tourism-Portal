-- Sabah place imagery — see
-- docs/plans/2026-08-14-1650-sabah-real-business-seed.md Phase 2.
--
-- 13 of 14 candidate slugs (4 regions + 10 POIs) got a usable photo; the
-- state row reuses the Kota Kinabalu region photo.
--
-- One genuine gap: pusat-orkid. Keeps image_url NULL.

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
;
