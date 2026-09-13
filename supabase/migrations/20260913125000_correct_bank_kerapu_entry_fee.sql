-- The Kelantan Museum Corporation lists War Museum (Bank Kerapu) admission
-- from RM2 for adults. Keep the place-level entry badge consistent with the
-- source-backed informational activities rather than presenting it as free.
UPDATE public.places
SET entry_fee = 2.00
WHERE slug = 'bank-kerapu'
  AND state = 'Kelantan'
  AND entry_fee IS DISTINCT FROM 2.00;
