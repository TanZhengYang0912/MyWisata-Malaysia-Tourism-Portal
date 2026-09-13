-- Correct customer-facing activity names and media after the catalogue review.
-- Image source metadata is recorded in
-- public/assets/customer/products/activity-media-credits.json.
BEGIN;

UPDATE public.products
SET name = 'Istana Jahar Museum Entry',
    cover_url = '/assets/customer/products/istanajahar-entry-ticket-corrected.jpg'
WHERE slug = 'istanajahar-entry-ticket'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET name = 'Istana Lama Seri Menanti Museum Entry',
    cover_url = '/assets/customer/products/istanalama-entry-ticket-corrected.jpg'
WHERE slug = 'istanalama-entry-ticket'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET name = 'Lost World of Tambun Day Pass',
    cover_url = '/assets/customer/products/lostworld-entry-ticket-corrected.jpg'
WHERE slug = 'lostworld-entry-ticket'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET name = 'Penang Hill Sunrise Return Ticket',
    cover_url = '/assets/customer/products/penang-hill-sunrise-ticket-corrected.jpg'
WHERE slug = 'penang-hill-sunrise-ticket'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET name = 'Taman Tamadun Islam Entry',
    cover_url = '/assets/customer/products/tamadun-islam-entry-ticket-corrected.jpg'
WHERE slug = 'tamadun-islam-entry-ticket'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET name = 'Taman Ular dan Reptilia Entry',
    cover_url = '/assets/customer/products/taman-ular-entry-ticket-corrected.jpg'
WHERE slug = 'taman-ular-entry-ticket'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET name = 'Upside Down House Kuching Entry',
    cover_url = '/assets/customer/products/upsidedown-entry-ticket-corrected.jpg'
WHERE slug = 'upsidedown-entry-ticket'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET cover_url = '/assets/customer/products/bukit-nanas-canopy-walk-guided-trek.jpg'
WHERE slug = 'bukit-nanas-canopy-walk-guided-trek'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET cover_url = '/assets/customer/products/central-market-craft-culture-walk.jpg'
WHERE slug = 'central-market-craft-culture-walk'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET cover_url = '/assets/customer/products/escape-day-pass-corrected.jpg'
WHERE slug = 'escape-day-pass'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET cover_url = '/assets/customer/products/jalan-alor-heritage-food-walk.jpg'
WHERE slug = 'jalan-alor-heritage-food-walk'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET cover_url = '/assets/customer/products/jalan-alor-street-food-crawl.jpg'
WHERE slug = 'jalan-alor-street-food-crawl'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET cover_url = '/assets/customer/products/late-night-hawker-tour.jpg'
WHERE slug = 'late-night-hawker-tour'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET cover_url = '/assets/customer/products/old-kl-market-heritage-walk.jpg'
WHERE slug = 'old-kl-market-heritage-walk'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET cover_url = '/assets/customer/products/op-river-cruise-day-ticket-corrected.jpg'
WHERE slug = 'op-river-cruise-day-ticket'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET cover_url = '/assets/customer/products/skybridge-observation-deck.jpg'
WHERE slug = 'skybridge-observation-deck'
  AND status = 'active'
  AND review_status = 'approved';

UPDATE public.products
SET cover_url = '/assets/customer/products/twin-towers-city-centre-walking-tour.jpg'
WHERE slug = 'twin-towers-city-centre-walking-tour'
  AND status = 'active'
  AND review_status = 'approved';

DO $$
DECLARE
  scoped_count integer;
  missing_count integer;
  generic_count integer;
  corrected_count integer;
BEGIN
  SELECT count(*)
  INTO scoped_count
  FROM public.products p
  JOIN public.categories c ON c.id = p.category_id
  WHERE p.status = 'active'
    AND p.review_status = 'approved'
    AND c.slug IN ('activity', 'experience');

  SELECT count(*)
  INTO missing_count
  FROM public.products p
  JOIN public.categories c ON c.id = p.category_id
  WHERE p.status = 'active'
    AND p.review_status = 'approved'
    AND c.slug IN ('activity', 'experience')
    AND nullif(trim(p.cover_url), '') IS NULL;

  SELECT count(*)
  INTO generic_count
  FROM public.products p
  JOIN public.categories c ON c.id = p.category_id
  WHERE p.status = 'active'
    AND p.review_status = 'approved'
    AND c.slug IN ('activity', 'experience')
    AND lower(trim(p.name)) IN ('entry ticket', 'sunrise ticket');

  SELECT count(*)
  INTO corrected_count
  FROM public.products
  WHERE slug IN (
    'bukit-nanas-canopy-walk-guided-trek',
    'central-market-craft-culture-walk',
    'escape-day-pass',
    'istanajahar-entry-ticket',
    'istanalama-entry-ticket',
    'jalan-alor-heritage-food-walk',
    'jalan-alor-street-food-crawl',
    'late-night-hawker-tour',
    'lostworld-entry-ticket',
    'old-kl-market-heritage-walk',
    'op-river-cruise-day-ticket',
    'penang-hill-sunrise-ticket',
    'skybridge-observation-deck',
    'tamadun-islam-entry-ticket',
    'taman-ular-entry-ticket',
    'twin-towers-city-centre-walking-tour',
    'upsidedown-entry-ticket'
  )
  AND cover_url IS NOT NULL;

  IF scoped_count = 0 OR missing_count <> 0 OR generic_count <> 0 OR corrected_count <> 17 THEN
    RAISE EXCEPTION 'activity media consistency failed; scoped=%, missing=%, generic=%, corrected=%',
      scoped_count, missing_count, generic_count, corrected_count;
  END IF;
END $$;

COMMIT;
