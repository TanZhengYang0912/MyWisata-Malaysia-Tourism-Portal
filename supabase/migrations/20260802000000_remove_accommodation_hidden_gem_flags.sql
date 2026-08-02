-- Hidden Gem is an editorial collection, but these two accommodation rows
-- were incorrectly tagged in the remote catalogue. Keep the update narrow and
-- idempotent so legitimate future accommodation Hidden Gems remain possible.
UPDATE public.products AS p
SET is_hidden_gem = FALSE
FROM public.categories AS c
WHERE p.category_id = c.id
  AND c.slug = 'accommodation'
  AND p.name IN ('Baba Nyonya Suite', 'Seaside Longhouse Room')
  AND p.is_hidden_gem IS TRUE;
