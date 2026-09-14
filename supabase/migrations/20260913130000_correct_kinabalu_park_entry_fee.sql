-- Sabah Parks lists the Malaysian adult conservation fee for Kinabalu Park as RM10.
-- Keep the public place card from incorrectly presenting admission as free.
UPDATE public.places
SET entry_fee = 10.00
WHERE slug = 'kinabalu-park'
  AND state = 'Sabah'
  AND entry_fee IS DISTINCT FROM 10.00;
