CREATE OR REPLACE FUNCTION public.get_admin_recommendation_stats(
  p_category_id uuid DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH matching AS (
    SELECT r.status, r.state
    FROM public.vendor_recommendations AS r
    WHERE (p_category_id IS NULL OR r.category_id = p_category_id)
      AND (p_state IS NULL OR r.state = p_state)
      AND (p_search IS NULL OR r.vendor_name ILIKE '%' || p_search || '%')
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'reviewed', count(*) FILTER (WHERE status <> 'pending'),
    'approved', count(*) FILTER (WHERE status = 'approved'),
    'rejected', count(*) FILTER (WHERE status = 'rejected'),
    'states', COALESCE(
      (SELECT jsonb_agg(state ORDER BY state)
       FROM (SELECT DISTINCT state FROM matching WHERE state IS NOT NULL) AS distinct_states),
      '[]'::jsonb
    )
  )
  FROM matching;
$$;

REVOKE ALL ON FUNCTION public.get_admin_recommendation_stats(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_recommendation_stats(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
