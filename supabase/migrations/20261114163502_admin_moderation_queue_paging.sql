-- Bounded Chat Reports list with global summary/reputation aggregates.
CREATE OR REPLACE FUNCTION public.list_admin_chat_reports(
  p_page integer,
  p_page_size integer,
  p_tab text,
  p_closed_status text,
  p_reason text,
  p_sort text,
  p_search text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000
    OR p_page_size NOT IN (10, 25, 50)
    OR p_tab NOT IN ('open', 'closed')
    OR p_closed_status NOT IN ('all', 'resolved', 'dismissed')
    OR p_reason NOT IN ('all', 'scam', 'abuse', 'spam', 'other')
    OR p_sort NOT IN ('newest', 'oldest', 'reason')
    OR length(coalesce(p_search, '')) > 200 THEN
    RAISE EXCEPTION 'invalid_chat_report_filters';
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT r.*
    FROM public.chat_reports AS r
    LEFT JOIN public.chat_threads AS t ON t.id = r.thread_id
    LEFT JOIN public.outlets AS o ON o.id = t.outlet_id
    LEFT JOIN public.users AS reporter ON reporter.id = r.reporter_id
    WHERE ((p_tab = 'open' AND r.status = 'open') OR (p_tab = 'closed' AND r.status <> 'open'))
      AND (p_tab <> 'closed' OR p_closed_status = 'all' OR r.status = p_closed_status)
      AND (p_reason = 'all' OR r.reason = p_reason)
      AND (NULLIF(btrim(p_search), '') IS NULL OR position(lower(btrim(p_search)) IN lower(concat_ws(' ', o.name, reporter.full_name, reporter.email, r.details))) > 0)
  ),
  page_rows AS (
    SELECT f.*
    FROM filtered AS f
    ORDER BY
      CASE WHEN p_sort = 'reason' THEN lower(f.reason) END ASC,
      CASE WHEN p_sort = 'oldest' THEN f.created_at END ASC,
      CASE WHEN p_sort <> 'oldest' THEN f.created_at END DESC,
      f.id ASC
    OFFSET (p_page - 1) * p_page_size
    LIMIT p_page_size
  )
  SELECT jsonb_build_object(
    'page', p_page,
    'pageSize', p_page_size,
    'total', (SELECT count(*) FROM filtered),
    'summary', jsonb_build_object(
      'openCount', (SELECT count(*) FROM public.chat_reports WHERE status = 'open'),
      'closedCount', (SELECT count(*) FROM public.chat_reports WHERE status <> 'open')
    ),
    'reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'thread_id', r.thread_id,
        'reporter_id', r.reporter_id,
        'reason', r.reason,
        'details', r.details,
        'status', r.status,
        'resolution_reason', r.resolution_reason,
        'resolution_note', r.resolution_note,
        'resolved_at', r.resolved_at,
        'created_at', r.created_at,
        'reporter', jsonb_build_object('full_name', reporter.full_name, 'email', reporter.email),
        'chat_threads', jsonb_build_object(
          'customer_id', t.customer_id,
          'created_at', t.created_at,
          'customer', jsonb_build_object('full_name', customer.full_name, 'email', customer.email),
          'outlets', jsonb_build_object('name', o.name)
        ),
        'reporterStats', jsonb_build_object(
          'total', (SELECT count(*) FROM public.chat_reports AS rs WHERE rs.reporter_id = r.reporter_id),
          'dismissed', (SELECT count(*) FROM public.chat_reports AS rs WHERE rs.reporter_id = r.reporter_id AND rs.status = 'dismissed')
        ),
        'sameThreadReportCount', (SELECT count(*) FROM public.chat_reports AS ts WHERE ts.thread_id = r.thread_id),
        'reporterBannedUntil', (
          SELECT max(b.banned_until) FROM public.chat_report_bans AS b
          WHERE b.user_id = r.reporter_id AND b.banned_until > now()
        )
      ) ORDER BY
        CASE WHEN p_sort = 'reason' THEN lower(r.reason) END ASC,
        CASE WHEN p_sort = 'oldest' THEN r.created_at END ASC,
        CASE WHEN p_sort <> 'oldest' THEN r.created_at END DESC,
        r.id ASC)
      FROM page_rows AS r
      JOIN public.chat_threads AS t ON t.id = r.thread_id
      JOIN public.outlets AS o ON o.id = t.outlet_id
      LEFT JOIN public.users AS reporter ON reporter.id = r.reporter_id
      LEFT JOIN public.users AS customer ON customer.id = t.customer_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_chat_reports(integer, integer, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_chat_reports(integer, integer, text, text, text, text, text) TO service_role;

-- Deduplicate flags before group paging so duplicates and large tickets cannot hide records.
CREATE OR REPLACE FUNCTION public.list_admin_moderation_flag_groups(
  p_page integer,
  p_page_size integer,
  p_show_reviewed boolean,
  p_group_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000
    OR p_page_size NOT IN (10, 25, 50)
    OR (p_group_key IS NOT NULL AND (length(p_group_key) > 200 OR p_page_size > 25)) THEN
    RAISE EXCEPTION 'invalid_moderation_flag_page';
  END IF;

  IF p_group_key IS NOT NULL THEN
    WITH base AS MATERIALIZED (
      SELECT f.id, f.source_type, f.source_id, f.user_id,
        CASE WHEN f.source_type = 'ticket' THEN f.source_id
          WHEN f.source_type = 'ticket_reply' THEN reply.ticket_id ELSE NULL END AS ticket_id,
        f.flag_type, f.severity, f.original_excerpt, f.status, f.created_at, f.reviewed_at,
        coalesce(u.full_name, u.email, 'Unknown user') AS user_name
      FROM public.moderation_flags AS f
      LEFT JOIN public.support_ticket_replies AS reply ON f.source_type = 'ticket_reply' AND reply.id = f.source_id
      LEFT JOIN public.users AS u ON u.id = f.user_id
    ),
    ranked AS (
      SELECT base.*, row_number() OVER (
        PARTITION BY coalesce(ticket_id::text, 'no-ticket'), source_type, source_id, flag_type, coalesce(original_excerpt, '')
        ORDER BY created_at DESC, id DESC
      ) AS duplicate_rank
      FROM base
    ),
    deduped AS (
      SELECT ranked.*,
        CASE WHEN ticket_id IS NOT NULL THEN 'ticket:' || ticket_id::text
          ELSE 'source:' || source_type || ':' || source_id::text END AS group_key
      FROM ranked WHERE duplicate_rank = 1
    ),
    matching AS (SELECT * FROM deduped WHERE group_key = p_group_key AND (p_show_reviewed OR status = 'open')),
    page_rows AS (
      SELECT * FROM matching ORDER BY created_at DESC, id DESC
      OFFSET (p_page - 1) * p_page_size LIMIT p_page_size
    )
    SELECT jsonb_build_object(
      'flags', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'sourceType', source_type, 'sourceId', source_id, 'ticketId', ticket_id,
        'userId', user_id, 'userName', user_name, 'flagType', flag_type, 'severity', severity,
        'originalExcerpt', original_excerpt, 'status', status, 'createdAt', created_at, 'reviewedAt', reviewed_at
      ) ORDER BY created_at DESC, id DESC) FROM page_rows), '[]'::jsonb),
      'totalFlags', (SELECT count(*) FROM matching),
      'page', p_page, 'pageSize', p_page_size,
      'totalFlagCount', (SELECT count(*) FROM deduped),
      'openFlagCount', (SELECT count(*) FROM deduped WHERE status = 'open')
    ) INTO v_result;
  ELSE
    WITH base AS MATERIALIZED (
      SELECT f.id, f.source_type, f.source_id, f.user_id,
        CASE WHEN f.source_type = 'ticket' THEN f.source_id
          WHEN f.source_type = 'ticket_reply' THEN reply.ticket_id ELSE NULL END AS ticket_id,
        f.flag_type, f.severity, f.original_excerpt, f.status, f.created_at, f.reviewed_at,
        coalesce(u.full_name, u.email, 'Unknown user') AS user_name
      FROM public.moderation_flags AS f
      LEFT JOIN public.support_ticket_replies AS reply ON f.source_type = 'ticket_reply' AND reply.id = f.source_id
      LEFT JOIN public.users AS u ON u.id = f.user_id
    ),
    ranked AS (
      SELECT base.*, row_number() OVER (
        PARTITION BY coalesce(ticket_id::text, 'no-ticket'), source_type, source_id, flag_type, coalesce(original_excerpt, '')
        ORDER BY created_at DESC, id DESC
      ) AS duplicate_rank
      FROM base
    ),
    deduped AS (
      SELECT ranked.*,
        CASE WHEN ticket_id IS NOT NULL THEN 'ticket:' || ticket_id::text
          ELSE 'source:' || source_type || ':' || source_id::text END AS group_key
      FROM ranked WHERE duplicate_rank = 1
    ),
    visible AS (SELECT * FROM deduped WHERE p_show_reviewed OR status = 'open'),
    group_counts AS (
      SELECT group_key, min(ticket_id::text)::uuid AS ticket_id,
        count(*)::integer AS distinct_flag_count,
        count(*) FILTER (WHERE status = 'open')::integer AS open_flag_count,
        max(created_at) AS latest_created_at
      FROM visible GROUP BY group_key
    ),
    latest AS (
      SELECT DISTINCT ON (group_key) group_key,
        jsonb_build_object(
          'id', id, 'sourceType', source_type, 'sourceId', source_id, 'ticketId', ticket_id,
          'userId', user_id, 'userName', user_name, 'flagType', flag_type, 'severity', severity,
          'originalExcerpt', original_excerpt, 'status', status, 'createdAt', created_at, 'reviewedAt', reviewed_at
        ) AS latest_flag,
        id AS latest_id
      FROM visible ORDER BY group_key, created_at DESC, id DESC
    ),
    groups AS (
      SELECT gc.*, latest.latest_flag, latest.latest_id
      FROM group_counts AS gc JOIN latest USING (group_key)
    ),
    page_groups AS (
      SELECT * FROM groups ORDER BY latest_created_at DESC, latest_id DESC
      OFFSET (p_page - 1) * p_page_size LIMIT p_page_size
    )
    SELECT jsonb_build_object(
      'groups', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'key', group_key, 'ticketId', ticket_id, 'latestFlag', latest_flag,
        'distinctFlagCount', distinct_flag_count, 'openFlagCount', open_flag_count
      ) ORDER BY latest_created_at DESC, latest_id DESC) FROM page_groups), '[]'::jsonb),
      'totalGroups', (SELECT count(*) FROM groups),
      'page', p_page, 'pageSize', p_page_size,
      'totalFlagCount', (SELECT count(*) FROM deduped),
      'openFlagCount', (SELECT count(*) FROM deduped WHERE status = 'open')
    ) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_moderation_flag_groups(integer, integer, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_moderation_flag_groups(integer, integer, boolean, text) TO service_role;
