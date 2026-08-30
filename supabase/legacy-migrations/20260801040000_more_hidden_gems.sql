-- ============================================================
-- 20260801040000_more_hidden_gems.sql
--
-- The place-bound cut (20260801010000) left exactly one product carrying
-- is_hidden_gem, so the badge and the Hidden Gem filter had almost nothing to
-- show. This marks nine more, spread across all four categories.
--
-- Chosen for what the badge is supposed to mean — somewhere a visitor would
-- not find on a top-ten list — not for rating or popularity. Hidden Gem stays
-- a product flag, not a category (see 20260731224343).
-- ============================================================

UPDATE products SET is_hidden_gem = TRUE WHERE id IN (
  -- Activity
  '5b9edc5c-0a24-4a68-966c-c52da4a30766',  -- Setiu Wetlands Nature Walk    · Kuala Terengganu
  'b60333b2-299a-4df2-8709-276c970ca4b5',  -- Gunung Tapis Waterfall Hike   · Kuantan
  'a6517e07-c1c4-4a65-a542-b7fdee634788',  -- Heritage Speakeasy            · George Town
  'dc10b262-cf5d-49a0-b4d6-9ae894a55bcb',  -- Riverside Night Market Bar    · Kuching
  -- Food
  '4208aee1-eea1-4351-98b5-4309168a2740',  -- Rojak Pasembur
  '217a11f0-2258-48da-b57c-2059c7879008',  -- Ipoh Hor Fun
  -- Accommodation
  'c62c2767-770d-4bf0-8097-5b33afad10d2',  -- Seaside Longhouse Room        · Kota Kinabalu
  '9a4bd36e-2219-420a-944c-a901b89c0b78',  -- Baba Nyonya Suite             · Melaka
  -- Retail
  '683cae49-e66a-4a77-a447-4a6386f6de15'   -- Local Artisan Gift Set        · Seremban
);

DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM products
   WHERE is_hidden_gem AND status = 'active' AND review_status = 'approved';
  IF n <> 10 THEN RAISE EXCEPTION 'expected 10 live hidden gems, found %', n; END IF;

  -- Every category should have at least one, or the badge looks like an
  -- activity-only feature.
  SELECT COUNT(*) INTO n FROM categories c
   WHERE c.slug IN ('food','activity','accommodation','retail')
     AND NOT EXISTS (SELECT 1 FROM products p
                      WHERE p.category_id = c.id AND p.is_hidden_gem
                        AND p.status = 'active' AND p.review_status = 'approved');
  IF n > 0 THEN RAISE EXCEPTION '% categor(y/ies) have no hidden gem', n; END IF;
END $$;
