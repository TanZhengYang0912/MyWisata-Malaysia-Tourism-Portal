-- Keep the staff conduct list bounded at the database boundary. The queue
-- combines two distinct evidence tables in one snapshot so sort order, the
-- filtered total, and the existing global metric semantics stay consistent.
CREATE OR REPLACE FUNCTION public.get_admin_conduct_queue(
  p_actor_id uuid,
  p_page integer,
  p_page_size integer,
  p_query text,
  p_review_state text,
  p_record_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_actor_id IS NULL OR NOT coalesce(app_private.is_super_admin(p_actor_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'super_admin_required';
  END IF;

  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000
     OR p_page_size IS NULL OR p_page_size NOT IN (15, 25, 50)
     OR p_query IS NULL OR char_length(p_query) > 200
     OR p_review_state IS NULL OR p_review_state NOT IN ('open', 'reviewed', 'all')
     OR p_record_type IS NULL OR p_record_type NOT IN ('all', 'flagged_conduct', 'reported_chat') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'conduct_queue_invalid_query';
  END IF;

  RETURN (
    WITH unified AS (
      SELECT
        flag.id,
        'flagged_conduct'::text AS kind,
        flag.status::text AS status,
        flag.created_at,
        flag.severity::text AS severity,
        concat_ws(' ',
          coalesce(flagged_admin.full_name, flagged_admin.email, 'Unknown user'),
          coalesce(target_user.full_name, target_user.email, 'Unknown user'),
          flag.original_text,
          flag.source,
          flag.source_ref_id
        ) AS searchable_text,
        jsonb_build_object(
          'id', flag.id,
          'flaggedAdminName', coalesce(flagged_admin.full_name, flagged_admin.email, 'Unknown user'),
          'targetUserId', flag.target_user_id,
          'targetUserName', CASE WHEN flag.target_user_id IS NULL THEN NULL ELSE coalesce(target_user.full_name, target_user.email, 'Unknown user') END,
          'source', flag.source,
          'sourceRefId', flag.source_ref_id,
          'originalText', flag.original_text,
          'severity', flag.severity,
          'status', flag.status,
          'createdAt', flag.created_at
        ) AS data
      FROM public.admin_conduct_flags AS flag
      LEFT JOIN public.users AS flagged_admin ON flagged_admin.id = flag.flagged_admin_id
      LEFT JOIN public.users AS target_user ON target_user.id = flag.target_user_id

      UNION ALL

      SELECT
        report.id,
        'reported_chat'::text AS kind,
        report.status::text AS status,
        report.created_at,
        NULL::text AS severity,
        concat_ws(' ',
          coalesce(reporter.full_name, reporter.email, 'Unknown user'),
          coalesce(party_a.full_name, party_a.email, 'Unknown user'),
          CASE WHEN report.party_b_id IS NULL THEN NULL ELSE coalesce(party_b.full_name, party_b.email, 'Unknown user') END,
          report.reason,
          report.chat_type,
          report.thread_ref
        ) AS searchable_text,
        jsonb_build_object(
          'id', report.id,
          'reporterName', coalesce(reporter.full_name, reporter.email, 'Unknown user'),
          'partyAName', coalesce(party_a.full_name, party_a.email, 'Unknown user'),
          'partyBName', CASE WHEN report.party_b_id IS NULL THEN NULL ELSE coalesce(party_b.full_name, party_b.email, 'Unknown user') END,
          'chatType', report.chat_type,
          'threadRef', report.thread_ref,
          'reason', report.reason,
          'status', report.status,
          'createdAt', report.created_at
        ) AS data
      FROM public.chat_conduct_reports AS report
      LEFT JOIN public.users AS reporter ON reporter.id = report.reporter_id
      LEFT JOIN public.users AS party_a ON party_a.id = report.party_a_id
      LEFT JOIN public.users AS party_b ON party_b.id = report.party_b_id
    ),
    metrics AS (
      SELECT
        count(*) FILTER (WHERE status = 'open')::integer AS needs_action,
        count(*) FILTER (WHERE kind = 'flagged_conduct' AND status = 'open')::integer AS flagged_conduct,
        count(*) FILTER (WHERE kind = 'reported_chat' AND status = 'open')::integer AS reported_chat,
        count(*) FILTER (WHERE kind = 'flagged_conduct' AND status = 'open' AND severity = 'high')::integer AS high_severity,
        count(*) FILTER (WHERE status = 'reviewed')::integer AS reviewed
      FROM unified
    ),
    filtered AS (
      SELECT *
      FROM unified
      WHERE (p_review_state = 'all' OR status = p_review_state)
        AND (p_record_type = 'all' OR kind = p_record_type)
        AND (btrim(p_query) = '' OR strpos(lower(searchable_text), lower(btrim(p_query))) > 0)
    ),
    totals AS (
      SELECT count(*)::integer AS total FROM filtered
    ),
    page_info AS (
      SELECT
        total,
        greatest(1, ceil(total::numeric / p_page_size)::integer) AS total_pages,
        least(p_page, greatest(1, ceil(total::numeric / p_page_size)::integer)) AS page
      FROM totals
    ),
    page_rows AS MATERIALIZED (
      SELECT filtered.*
      FROM filtered
      CROSS JOIN page_info
      ORDER BY filtered.created_at DESC, filtered.kind ASC, filtered.id ASC
      LIMIT p_page_size
      OFFSET ((SELECT page FROM page_info) - 1)::bigint * p_page_size
    ),
    page_items AS (
      SELECT coalesce(
        jsonb_agg(jsonb_build_object(
          'id', id,
          'kind', kind,
          'status', status,
          'createdAt', created_at,
          'data', data
        ) ORDER BY created_at DESC, kind ASC, id ASC),
        '[]'::jsonb
      ) AS items
      FROM page_rows
    )
    SELECT jsonb_build_object(
      'items', page_items.items,
      'total', page_info.total,
      'page', page_info.page,
      'pageSize', p_page_size,
      'totalPages', page_info.total_pages,
      'metrics', jsonb_build_object(
        'needsAction', metrics.needs_action,
        'flaggedConduct', metrics.flagged_conduct,
        'reportedChat', metrics.reported_chat,
        'highSeverity', metrics.high_severity,
        'reviewed', metrics.reviewed
      )
    )
    FROM page_items
    CROSS JOIN page_info
    CROSS JOIN metrics
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_conduct_queue(uuid, integer, integer, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_conduct_queue(uuid, integer, integer, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.get_admin_conduct_queue(uuid, integer, integer, text, text, text) IS
  'Returns a bounded unified staff conduct page. The caller API verifies super-admin status and staff assurance before using the service-role RPC.';
