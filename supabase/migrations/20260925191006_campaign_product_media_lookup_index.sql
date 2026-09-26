-- The public campaign projection resolves one image per linked product. Index
-- that lookup and its ordering so each offer does not scan the full media table.
CREATE INDEX IF NOT EXISTS media_assets_product_image_lookup_idx
  ON public.media_assets (product_id, sort_order NULLS LAST, created_at)
  WHERE media_type = 'image';
