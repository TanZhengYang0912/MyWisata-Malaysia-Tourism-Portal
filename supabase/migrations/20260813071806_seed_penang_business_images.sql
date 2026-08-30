UPDATE products SET cover_url = '/assets/customer/penang/kek-lok-si-temple.webp'
  WHERE slug = 'kek-lok-si-entry';
UPDATE products SET cover_url = '/assets/customer/penang/penang-hill.webp'
  WHERE slug = 'penang-hill-funicular-return';
UPDATE products SET cover_url = '/assets/customer/penang/khoo-kongsi.webp'
  WHERE slug = 'khoo-kongsi-entry';
UPDATE products SET cover_url = '/assets/customer/penang/pinang-peranakan-mansion.webp'
  WHERE slug = 'peranakan-mansion-entry';
UPDATE products SET cover_url = '/assets/customer/penang/eastern-oriental-hotel.webp'
  WHERE slug = 'eo-heritage-wing-suite';
UPDATE products SET cover_url = '/assets/customer/penang/cheong-fatt-tze-mansion.webp'
  WHERE slug = 'blue-mansion-courtyard-room';

UPDATE vendors SET cover_url = '/assets/customer/penang/kek-lok-si-temple.webp'
  WHERE slug = 'kek-lok-si-temple-vendor';
UPDATE vendors SET cover_url = '/assets/customer/penang/penang-hill.webp'
  WHERE slug = 'penang-hill-corporation';
UPDATE vendors SET cover_url = '/assets/customer/penang/khoo-kongsi.webp'
  WHERE slug = 'khoo-kongsi-trust';
UPDATE vendors SET cover_url = '/assets/customer/penang/pinang-peranakan-mansion.webp'
  WHERE slug = 'pinang-peranakan-mansion-vendor';
UPDATE vendors SET cover_url = '/assets/customer/penang/eastern-oriental-hotel.webp'
  WHERE slug = 'eastern-oriental-hotel';
UPDATE vendors SET cover_url = '/assets/customer/penang/cheong-fatt-tze-mansion.webp'
  WHERE slug = 'cheong-fatt-tze-blue-mansion';

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM products WHERE cover_url IS NOT NULL;
  IF n <> 6 THEN RAISE EXCEPTION 'expected 6 products with cover_url, got %', n; END IF;

  SELECT count(*) INTO n FROM vendors WHERE cover_url IS NOT NULL;
  IF n <> 6 THEN RAISE EXCEPTION 'expected 6 vendors with cover_url, got %', n; END IF;
END $$;;
