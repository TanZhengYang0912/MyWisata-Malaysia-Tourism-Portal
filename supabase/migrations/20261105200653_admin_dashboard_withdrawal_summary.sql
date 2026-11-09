-- Aggregate dashboard withdrawal metrics in Postgres so the Admin client
-- never downloads every request just to compute totals and daily buckets.
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_withdrawal_summary(
  p_as_of timestamptz,
  p_review_statuses text[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH bounds AS (
    SELECT
      COALESCE(p_as_of, statement_timestamp()) AS as_of,
      ((COALESCE(p_as_of, statement_timestamp()) AT TIME ZONE 'Asia/Kuala_Lumpur')::date - 6)::timestamp
        AT TIME ZONE 'Asia/Kuala_Lumpur' AS from_at,
      ((COALESCE(p_as_of, statement_timestamp()) AT TIME ZONE 'Asia/Kuala_Lumpur')::date + 1)::timestamp
        AT TIME ZONE 'Asia/Kuala_Lumpur' AS until_at
  ),
  review AS (
    SELECT
      count(*)::integer AS count,
      COALESCE(sum(w.amount), 0)::numeric(14, 2) AS amount,
      count(*) FILTER (WHERE w.status = 'overdue')::integer AS overdue_count,
      count(*) FILTER (WHERE w.requires_dual_approval)::integer AS dual_approval_count,
      min(w.created_at) AS oldest_created_at
    FROM public.withdrawal_requests AS w
    WHERE w.status = ANY(COALESCE(p_review_statuses, ARRAY[]::text[]))
      AND w.created_at <= (SELECT as_of FROM bounds)
  ),
  daily AS (
    SELECT d.day::date AS day, count(w.id)::integer AS count
    FROM bounds AS b
    CROSS JOIN LATERAL generate_series(
      (b.from_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
      ((b.until_at - interval '1 microsecond') AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
      interval '1 day'
    ) AS d(day)
    LEFT JOIN public.withdrawal_requests AS w
      ON w.created_at >= (d.day::date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      AND w.created_at < ((d.day::date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      AND w.created_at <= b.as_of
    GROUP BY d.day
  )
  SELECT jsonb_build_object(
    'count', review.count,
    'amount', review.amount,
    'overdueCount', review.overdue_count,
    'dualApprovalCount', review.dual_approval_count,
    'oldestCreatedAt', review.oldest_created_at,
    'activity', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', daily.day, 'count', daily.count) ORDER BY daily.day)
      FROM daily
    ), '[]'::jsonb)
  )
  FROM review;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_withdrawal_summary(timestamptz, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_withdrawal_summary(timestamptz, text[]) TO service_role;

NOTIFY pgrst, 'reload schema';
