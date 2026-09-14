-- Allow vendor owners to select up to 4 featured products for their storefront
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS featured_product_ids uuid[] DEFAULT '{}'::uuid[];
