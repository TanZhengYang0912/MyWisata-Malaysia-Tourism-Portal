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
END $$;;
