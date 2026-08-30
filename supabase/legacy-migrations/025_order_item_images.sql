-- Preserve the product image that was shown when an order was created.
-- This keeps historical order cards and printed receipts stable after a
-- product image is changed or the product is archived.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Backfill existing order items where the original product still exists.
UPDATE public.order_items AS oi
SET image_url = p.cover_url
FROM public.products AS p
WHERE oi.product_id = p.id
  AND oi.image_url IS NULL
  AND p.cover_url IS NOT NULL;

