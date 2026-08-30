UPDATE products SET is_hidden_gem = TRUE WHERE id IN (
  '5b9edc5c-0a24-4a68-966c-c52da4a30766',
  'b60333b2-299a-4df2-8709-276c970ca4b5',
  'a6517e07-c1c4-4a65-a542-b7fdee634788',
  'dc10b262-cf5d-49a0-b4d6-9ae894a55bcb',
  '4208aee1-eea1-4351-98b5-4309168a2740',
  '217a11f0-2258-48da-b57c-2059c7879008',
  'c62c2767-770d-4bf0-8097-5b33afad10d2',
  '9a4bd36e-2219-420a-944c-a901b89c0b78',
  '683cae49-e66a-4a77-a447-4a6386f6de15'
);

DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM products
   WHERE is_hidden_gem AND status = 'active' AND review_status = 'approved';
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 live hidden gems, found %', n; END IF;

  SELECT COUNT(*) INTO n FROM categories c
   WHERE c.slug IN ('food','activity','accommodation','retail')
     AND NOT EXISTS (SELECT 1 FROM products p
                      WHERE p.category_id = c.id AND p.is_hidden_gem
                        AND p.status = 'active' AND p.review_status = 'approved');
  IF n > 0 THEN RAISE EXCEPTION '% categor(y/ies) have no hidden gem', n; END IF;
END $$;;
