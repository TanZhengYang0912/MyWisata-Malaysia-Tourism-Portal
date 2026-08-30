UPDATE places SET image_url = '/assets/customer/melaka/bandar-hilir.webp' WHERE slug = 'bandar-hilir';
UPDATE places SET image_url = '/assets/customer/melaka/melaka-river.webp' WHERE slug = 'melaka-river';
UPDATE places SET image_url = '/assets/customer/melaka/klebang.webp' WHERE slug = 'klebang';
UPDATE places SET image_url = '/assets/customer/melaka/ayer-keroh.webp' WHERE slug = 'ayer-keroh';

UPDATE places SET image_url = '/assets/customer/melaka/a-famosa.webp' WHERE slug = 'a-famosa';
UPDATE places SET image_url = '/assets/customer/melaka/st-pauls-church.webp' WHERE slug = 'st-pauls-church';
UPDATE places SET image_url = '/assets/customer/melaka/christ-church-melaka.webp' WHERE slug = 'christ-church-melaka';
UPDATE places SET image_url = '/assets/customer/melaka/the-stadthuys.webp' WHERE slug = 'the-stadthuys';
UPDATE places SET image_url = '/assets/customer/melaka/jonker-street.webp' WHERE slug = 'jonker-street';
UPDATE places SET image_url = '/assets/customer/melaka/menara-taming-sari.webp' WHERE slug = 'menara-taming-sari';
UPDATE places SET image_url = '/assets/customer/melaka/melaka-river-cruise.webp' WHERE slug = 'melaka-river-cruise';
UPDATE places SET image_url = '/assets/customer/melaka/kampung-morten.webp' WHERE slug = 'kampung-morten';
UPDATE places SET image_url = '/assets/customer/melaka/baba-nyonya-museum.webp' WHERE slug = 'baba-nyonya-museum';
UPDATE places SET image_url = '/assets/customer/melaka/melaka-straits-mosque.webp' WHERE slug = 'melaka-straits-mosque';
UPDATE places SET image_url = '/assets/customer/melaka/klebang-beach.webp' WHERE slug = 'klebang-beach';
UPDATE places SET image_url = '/assets/customer/melaka/melaka-zoo.webp' WHERE slug = 'melaka-zoo';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Melaka' AND image_url IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Melaka places still have no image_url', n; END IF;
END $$;;
