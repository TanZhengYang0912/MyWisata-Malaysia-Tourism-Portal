UPDATE places SET image_url = '/assets/customer/pahang/cameron-highlands.webp' WHERE slug = 'cameron-highlands';
UPDATE places SET image_url = '/assets/customer/pahang/genting-highlands.webp' WHERE slug = 'genting-highlands';
UPDATE places SET image_url = '/assets/customer/pahang/frasers-hill.webp' WHERE slug = 'frasers-hill';
UPDATE places SET image_url = '/assets/customer/pahang/kuantan.webp' WHERE slug = 'kuantan';
UPDATE places SET image_url = '/assets/customer/pahang/cherating.webp' WHERE slug = 'cherating';
UPDATE places SET image_url = '/assets/customer/pahang/taman-negara.webp' WHERE slug = 'taman-negara';
UPDATE places SET image_url = '/assets/customer/pahang/tioman-island.webp' WHERE slug = 'tioman-island';
UPDATE places SET image_url = '/assets/customer/pahang/sungai-lembing.webp' WHERE slug = 'sungai-lembing';

UPDATE places SET image_url = '/assets/customer/pahang/rafflesia-trail.webp' WHERE slug = 'rafflesia-trail';
UPDATE places SET image_url = '/assets/customer/pahang/mossy-forest.webp' WHERE slug = 'mossy-forest';
UPDATE places SET image_url = '/assets/customer/pahang/chin-swee-caves-temple.webp' WHERE slug = 'chin-swee-caves-temple';
UPDATE places SET image_url = '/assets/customer/pahang/genting-skyway.webp' WHERE slug = 'genting-skyway';
UPDATE places SET image_url = '/assets/customer/pahang/frasers-hill-clock-tower.webp' WHERE slug = 'frasers-hill-clock-tower';
UPDATE places SET image_url = '/assets/customer/pahang/teluk-cempedak-beach.webp' WHERE slug = 'teluk-cempedak-beach';
UPDATE places SET image_url = '/assets/customer/pahang/gua-charas.webp' WHERE slug = 'gua-charas';
UPDATE places SET image_url = '/assets/customer/pahang/sungai-pandan-waterfall.webp' WHERE slug = 'sungai-pandan-waterfall';
UPDATE places SET image_url = '/assets/customer/pahang/canopy-walkway.webp' WHERE slug = 'canopy-walkway';
UPDATE places SET image_url = '/assets/customer/pahang/bukit-teresek.webp' WHERE slug = 'bukit-teresek';
UPDATE places SET image_url = '/assets/customer/pahang/asah-waterfall.webp' WHERE slug = 'asah-waterfall';
UPDATE places SET image_url = '/assets/customer/pahang/rainbow-waterfall.webp' WHERE slug = 'rainbow-waterfall';
UPDATE places SET image_url = '/assets/customer/pahang/tin-mine-museum.webp' WHERE slug = 'tin-mine-museum';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Pahang' AND image_url IS NOT NULL;
  IF n <> 22 THEN RAISE EXCEPTION 'expected 22 Pahang places with an image, found %', n; END IF;
END $$;;
