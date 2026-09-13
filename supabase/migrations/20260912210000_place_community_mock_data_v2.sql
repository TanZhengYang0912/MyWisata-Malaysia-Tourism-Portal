-- Replace the historical generic Local Notes with place-aware development data.
-- This is intentionally additive/idempotent: user-authored notes are untouched.
DO $$
DECLARE
  customer_ids UUID[] := ARRAY[
    'aaaaaaaa-0000-0000-0000-000000000005'::UUID,
    'aaaaaaaa-0000-0000-0000-000000000006'::UUID,
    'aaaaaaaa-0000-0000-0000-000000000007'::UUID,
    'aaaaaaaa-0000-0000-0000-000000000008'::UUID
  ];
  place RECORD;
  legacy RECORD;
  area TEXT;
  comment_body TEXT;
  scenario INTEGER;
BEGIN
  IF (SELECT COUNT(*) FROM public.users WHERE id = ANY(customer_ids)) <> CARDINALITY(customer_ids) THEN
    RAISE EXCEPTION 'Established demo customers are required for place community mock data.';
  END IF;

  FOR place IN
    SELECT id, level, name, state, district
    FROM public.places
    WHERE status = 'active'
    ORDER BY level, sort_order, name
  LOOP
    area := COALESCE(NULLIF(BTRIM(place.district), ''), place.state);

    comment_body := CASE place.level
      WHEN 'state' THEN format(
        'A relaxed first day in %s starts with choosing one neighbourhood as your base. Keep the morning flexible and check opening hours before heading out.',
        place.name
      )
      WHEN 'region' THEN format(
        'The quieter way to see %s is to arrive before the busiest hour and give yourself time to explore %s on foot.',
        place.name, area
      )
      ELSE format(
        'Morning light makes %s easier to enjoy, and %s is a convenient place to pause before the next stop.',
        place.name, area
      )
    END;

    SELECT id INTO legacy
    FROM public.place_comments
    WHERE place_id = place.id
      AND status = 'published'
      AND body LIKE 'Sample local tip for %'
    ORDER BY created_at, id
    LIMIT 1;

    IF legacy.id IS NOT NULL THEN
      UPDATE public.place_comments
      SET user_id = customer_ids[1], body = comment_body, is_anonymous = false
      WHERE id = legacy.id;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.place_comments
      WHERE place_id = place.id AND place_comments.body = comment_body
    ) THEN
      INSERT INTO public.place_comments (id, place_id, user_id, body, status, is_anonymous, created_at)
      VALUES (
        md5(format('place-community:%s:0', place.id))::UUID,
        place.id,
        customer_ids[1],
        comment_body,
        'published',
        false,
        now() - make_interval(days => 4)
      )
      ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, user_id = EXCLUDED.user_id, is_anonymous = EXCLUDED.is_anonymous;
    END IF;

    FOR scenario IN 1..2 LOOP
      comment_body := CASE
        WHEN place.level = 'state' AND scenario = 1 THEN format(
          'For %s, leave a little buffer between stops; traffic and short food breaks are part of the day, especially around %s.',
          place.name, area
        )
        WHEN place.level = 'state' THEN format(
          'A practical tip for %s: carry water, save offline directions, and plan one indoor stop in case the afternoon weather turns.',
          place.name
        )
        WHEN place.level = 'region' AND scenario = 1 THEN format(
          'If %s is one stop in a %s day, pair it with a nearby meal rather than crossing the state between visits.',
          place.name, place.state
        )
        WHEN place.level = 'region' THEN format(
          'Bring comfortable shoes to %s; the best parts are often reached after a short walk from the main drop-off.',
          place.name
        )
        WHEN scenario = 1 THEN format(
          'Give %s more time than a quick photo stop; a slower loop through %s makes the visit feel less rushed.',
          place.name, area
        )
        ELSE format(
          'For %s, check the weather and wear shoes with grip. The route around %s can be more comfortable at an easy pace.',
          place.name, area
        )
      END;

      INSERT INTO public.place_comments (id, place_id, user_id, body, status, is_anonymous, created_at)
      VALUES (
        md5(format('place-community:%s:%s', place.id, scenario))::UUID,
        place.id,
        customer_ids[scenario + 1],
        comment_body,
        'published',
        scenario = 2,
        now() - make_interval(days => 4 + scenario)
      )
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        body = EXCLUDED.body,
        status = EXCLUDED.status,
        is_anonymous = EXCLUDED.is_anonymous;
    END LOOP;
  END LOOP;
END $$;
