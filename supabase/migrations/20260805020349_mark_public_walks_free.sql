-- Public heritage walks are free to explore and do not require a booking.
-- A vendor can still publish a separate guided tour for the same area; that paid service must remain a distinct product from the public place row.
-- This correction is intentionally idempotent and does not delete old slots or booking history.
UPDATE public.products
SET requires_booking = FALSE,
    base_price = 0
WHERE slug IN (
  'george-town-story-walk-penang',
  'jonker-walk-heritage-trail',
  'merdeka-square-heritage-walk'
)
  AND type_slugs && ARRAY['cultural']::text[];;
