-- Development-only mock Local Notes. The notes are transparently labelled as
-- samples and all belong to the verified Customer Alice demo account.
DO $$
DECLARE
  customer_id UUID := 'aaaaaaaa-0000-0000-0000-000000000005';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = customer_id
      AND email = 'customer1@demo.local'
  ) THEN
    RAISE EXCEPTION 'Customer Alice demo account is missing; mock Local Notes were not seeded.';
  END IF;

  INSERT INTO public.place_comments (place_id, user_id, body, status, created_at)
  SELECT
    place.id,
    customer_id,
    CASE place.level
      WHEN 'state' THEN format(
        'Sample local tip for %s: use one neighbourhood as your base, check same-day opening hours, and leave time for a relaxed food stop.',
        place.name
      )
      WHEN 'region' THEN format(
        'Sample local tip for %s: arrive earlier for a quieter start, keep water with you, and explore at an easy pace.',
        place.name
      )
      ELSE format(
        'Sample local tip for %s: comfortable shoes and a quick weather check will make the visit smoother.',
        place.name
      )
    END,
    'published',
    now() - make_interval(days => ((row_number() OVER (ORDER BY place.level, place.sort_order, place.name)::INTEGER - 1) % 21))
  FROM public.places AS place
  WHERE place.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.place_comments AS comment
      WHERE comment.place_id = place.id
        AND comment.user_id = customer_id
    );
END $$;
