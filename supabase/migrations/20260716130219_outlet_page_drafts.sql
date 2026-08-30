-- Keep legacy outlet page fields readable while separating vendor drafts from public content.
ALTER TABLE public.outlet_pages
  ADD COLUMN IF NOT EXISTS draft_document JSONB,
  ADD COLUMN IF NOT EXISTS published_document JSONB,
  ADD COLUMN IF NOT EXISTS draft_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_published_by UUID REFERENCES public.users(id);

-- Preserve existing outlet pages as both the initial draft and the initial
-- published version. The application normalizer will safely discard legacy
-- Hero entries from blocks and keep them in the dedicated hero field.
WITH legacy_documents AS (
  SELECT
    op.id,
    jsonb_build_object(
      'version', 1,
      'hero', jsonb_build_object(
        'id', 'hero',
        'type', 'hero',
        'title', COALESCE((
          SELECT item->>'title'
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(op.blocks) = 'array' THEN op.blocks ELSE '[]'::jsonb END) AS item
          WHERE item->>'type' = 'hero'
          LIMIT 1
        ), o.name, 'Discover this outlet'),
        'body', COALESCE((
          SELECT item->>'body'
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(op.blocks) = 'array' THEN op.blocks ELSE '[]'::jsonb END) AS item
          WHERE item->>'type' = 'hero'
          LIMIT 1
        ), 'Discover local food, culture and experiences from this outlet.'),
        'imageUrl', NULLIF(COALESCE(
          op.hero_url,
          (SELECT COALESCE(item->>'imageUrl', item->>'image')
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(op.blocks) = 'array' THEN op.blocks ELSE '[]'::jsonb END) AS item
           WHERE item->>'type' = 'hero'
           LIMIT 1)
        ), '')
      ),
      'blocks', COALESCE((
        SELECT jsonb_agg(item)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(op.blocks) = 'array' THEN op.blocks ELSE '[]'::jsonb END) AS item
        WHERE item->>'type' <> 'hero'
      ), '[]'::jsonb),
      'gallery', CASE WHEN jsonb_typeof(op.gallery) = 'array' THEN op.gallery ELSE '[]'::jsonb END,
      'brandColour', CASE WHEN op.brand_colour ~ '^#[0-9A-Fa-f]{6}$' THEN op.brand_colour ELSE '#00004D' END,
      'fontFamily', COALESCE(NULLIF(op.font_family, ''), 'Plus Jakarta Sans'),
      'featuredIds', COALESCE(to_jsonb(op.featured_ids), '[]'::jsonb),
      'seoTitle', COALESCE(op.seo_title, ''),
      'seoDescription', COALESCE(op.seo_description, '')
    ) AS document
  FROM public.outlet_pages op
  JOIN public.outlets o ON o.id = op.outlet_id
  WHERE op.draft_document IS NULL
    AND op.published_document IS NULL
)
UPDATE public.outlet_pages op
SET
  draft_document = legacy.document,
  published_document = legacy.document,
  published_version = 1,
  published_at = COALESCE(op.updated_at, now())
FROM legacy_documents legacy
WHERE op.id = legacy.id;

ALTER TABLE public.outlet_pages ENABLE ROW LEVEL SECURITY;

-- Public consumers receive only public legacy fields and the published document.
-- Draft JSON is intentionally omitted from this view.
DROP VIEW IF EXISTS public.public_outlet_pages;
CREATE VIEW public.public_outlet_pages
WITH (security_barrier = true)
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

REVOKE ALL ON public.outlet_pages FROM anon, authenticated;
GRANT SELECT ON public.public_outlet_pages TO anon, authenticated;
;
