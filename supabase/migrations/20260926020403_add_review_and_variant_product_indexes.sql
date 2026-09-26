CREATE INDEX IF NOT EXISTS reviews_product_id_idx
  ON public.reviews (product_id);

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx
  ON public.product_variants (product_id);
