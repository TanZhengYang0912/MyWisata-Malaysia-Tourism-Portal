CREATE OR REPLACE FUNCTION public.get_admin_withdrawal_filter_summary(
  p_statuses text[] DEFAULT NULL,
  p_risk_level text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH matching AS (
    SELECT
      wr.id,
      wr.amount,
      wr.status,
      coalesce(risk.risk_level, '') AS risk_level
    FROM public.withdrawal_requests AS wr
    JOIN public.users AS u ON u.id = wr.user_id
    LEFT JOIN public.withdrawal_risk_assessments AS risk ON risk.withdrawal_id = wr.id
    WHERE (p_statuses IS NULL OR wr.status = ANY(p_statuses))
      AND (p_risk_level IS NULL OR risk.risk_level = p_risk_level)
      AND (
        p_search IS NULL
        OR u.full_name ILIKE '%' || p_search || '%'
        OR u.email ILIKE '%' || p_search || '%'
      )
  )
  SELECT jsonb_build_object(
    'payoutValueSen', coalesce(sum(round(amount * 100)) FILTER (
      WHERE status = ANY(ARRAY['pending', 'pending_second_approval', 'hold', 'overdue']::text[])
    ), 0)::bigint,
    'highRiskCount', count(*) FILTER (WHERE matching.risk_level = 'high'),
    'overdueCount', count(*) FILTER (WHERE matching.status = 'overdue')
  )
  FROM matching;
$$;

REVOKE ALL ON FUNCTION public.get_admin_withdrawal_filter_summary(text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_withdrawal_filter_summary(text[], text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
