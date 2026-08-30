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
;
