-- Make the public projection enforce the querying user's permissions and RLS.
DROP VIEW IF EXISTS public.public_outlet_pages;

DROP POLICY IF EXISTS outlet_pages_public_read ON public.outlet_pages;

CREATE POLICY outlet_pages_public_read
ON public.outlet_pages
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.outlets o
    JOIN public.vendors v ON v.id = o.vendor_id
    WHERE o.id = outlet_pages.outlet_id
      AND o.status = 'active'
      AND v.status = 'approved'
  )
);

GRANT SELECT (
  outlet_id,
  hero_url,
  brand_colour,
  font_family,
  featured_ids,
  seo_title,
  seo_description,
  blocks,
  gallery,
  published_document,
  published_version,
  published_at
) ON public.outlet_pages TO anon, authenticated;

CREATE VIEW public.public_outlet_pages
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  op.outlet_id,
  op.hero_url,
  op.brand_colour,
  op.font_family,
  op.featured_ids,
  op.seo_title,
  op.seo_description,
  op.blocks,
  op.gallery,
  op.published_document,
  op.published_version,
  op.published_at
FROM public.outlet_pages op
JOIN public.outlets o ON o.id = op.outlet_id
JOIN public.vendors v ON v.id = o.vendor_id
WHERE o.status = 'active'
  AND v.status = 'approved';

GRANT SELECT ON public.public_outlet_pages TO anon, authenticated;
