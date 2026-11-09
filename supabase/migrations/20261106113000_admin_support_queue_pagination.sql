CREATE INDEX IF NOT EXISTS support_tickets_created_at_id_idx
  ON public.support_tickets (created_at DESC, id);

CREATE INDEX IF NOT EXISTS support_tickets_assignee_created_at_id_idx
  ON public.support_tickets (assigned_to, created_at DESC, id)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_ticket_replies_ticket_role_created_idx
  ON public.support_ticket_replies (ticket_id, sender_role, created_at);

CREATE OR REPLACE FUNCTION app_private.get_admin_support_queue(
  p_page integer,
  p_category text,
  p_status text,
  p_assigned_to_me boolean,
  p_unread_only boolean,
  p_search text,
  p_sort text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT app_private.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'support_ticket_permission_required';
  END IF;

  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000
     OR p_category IS NULL OR p_category NOT IN ('all', 'booking', 'payment', 'vendor', 'withdrawal', 'affiliate', 'general', 'kyc', 'technical')
     OR p_status IS NULL OR p_status NOT IN ('all', 'open', 'in_progress', 'resolved', 'closed')
     OR p_assigned_to_me IS NULL OR p_unread_only IS NULL
     OR p_search IS NULL OR length(p_search) > 200
     OR p_sort IS NULL OR p_sort NOT IN ('default', 'created', 'lastActivity', 'status', 'category', 'unread') THEN
    RAISE EXCEPTION 'support_ticket_invalid_queue_query';
  END IF;

  WITH admin_reply_summary AS MATERIALIZED (
    SELECT reply.ticket_id, min(reply.created_at) AS first_admin_reply_at
      FROM public.support_ticket_replies reply
     WHERE reply.sender_role = 'admin'
     GROUP BY reply.ticket_id
  ),
  filtered AS MATERIALIZED (
    SELECT
      ticket.id,
      ticket.user_id,
      ticket.subject,
      ticket.category,
      ticket.classification_method,
      ticket.status,
      ticket.created_at,
      coalesce(ticket.last_reply_at, ticket.created_at) AS last_activity_at,
      reply_summary.first_admin_reply_at,
      EXISTS (
        SELECT 1 FROM public.support_ticket_replies customer_reply
         WHERE customer_reply.ticket_id = ticket.id
           AND customer_reply.sender_role = 'customer'
           AND customer_reply.created_at > coalesce(ticket.admin_last_read_at, '-infinity'::timestamptz)
      ) AS unread,
      nullif(requester.full_name, '') AS user_name
    FROM public.support_tickets ticket
    LEFT JOIN public.users requester ON requester.id = ticket.user_id
    LEFT JOIN admin_reply_summary reply_summary ON reply_summary.ticket_id = ticket.id
     WHERE (p_category = 'all' OR ticket.category = p_category)
       AND (p_status = 'all' OR ticket.status = p_status)
       AND (NOT p_assigned_to_me OR ticket.assigned_to = auth.uid())
       AND (NOT p_unread_only OR EXISTS (
         SELECT 1 FROM public.support_ticket_replies customer_reply
          WHERE customer_reply.ticket_id = ticket.id
            AND customer_reply.sender_role = 'customer'
            AND customer_reply.created_at > coalesce(ticket.admin_last_read_at, '-infinity'::timestamptz)
       ))
       AND (p_search = '' OR position(lower(p_search) in lower(concat_ws(' ', ticket.subject, ticket.body,
         CASE WHEN ticket.user_id IS NULL THEN 'Guest' ELSE coalesce(nullif(requester.full_name, ''), requester.email, 'Unknown user') END,
         ticket.category))) > 0)
  ),
  totals AS (
    SELECT count(*)::bigint AS total FROM filtered
  ),
  page_info AS (
    SELECT least(p_page, greatest(1, ceil(total::numeric / 10)::integer)) AS page, total FROM totals
  ),
  page_rows AS MATERIALIZED (
    SELECT filtered.*
      FROM filtered
     ORDER BY
       CASE WHEN p_sort = 'default' AND first_admin_reply_at IS NOT NULL THEN 1 ELSE 0 END ASC,
       CASE WHEN p_sort = 'default' THEN created_at END ASC,
       CASE WHEN p_sort = 'created' THEN created_at END DESC,
       CASE WHEN p_sort = 'lastActivity' THEN last_activity_at END DESC,
       CASE WHEN p_sort = 'status' THEN status END ASC,
       CASE WHEN p_sort = 'category' THEN category END ASC,
       CASE WHEN p_sort IN ('status', 'category') THEN created_at END DESC,
       CASE WHEN p_sort = 'unread' THEN unread::integer END DESC,
       CASE WHEN p_sort = 'unread' THEN created_at END DESC,
       id ASC
     LIMIT 10 OFFSET ((SELECT page FROM page_info) - 1)::bigint * 10
  ),
  stats AS (
    SELECT count(*) FILTER (WHERE ticket.status = 'open') AS open,
      count(*) FILTER (WHERE ticket.status = 'in_progress') AS in_progress,
      count(*) FILTER (WHERE ticket.status = 'resolved') AS resolved,
      count(*) FILTER (WHERE reply_summary.first_admin_reply_at IS NULL) AS unanswered,
      avg(extract(epoch FROM (reply_summary.first_admin_reply_at - ticket.created_at)) / 3600.0) AS avg_first_response_hours
      FROM public.support_tickets ticket
      LEFT JOIN admin_reply_summary reply_summary ON reply_summary.ticket_id = ticket.id
  )
  SELECT jsonb_build_object(
    'tickets', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'userName', CASE WHEN user_id IS NULL THEN 'Guest' ELSE user_name END,
        'subject', subject,
        'category', category,
        'classificationMethod', classification_method,
        'status', status,
        'createdAt', created_at,
        'lastActivityAt', last_activity_at,
        'unread', unread,
        'unanswered', first_admin_reply_at IS NULL
      ) ORDER BY
        CASE WHEN p_sort = 'default' AND first_admin_reply_at IS NOT NULL THEN 1 ELSE 0 END ASC,
        CASE WHEN p_sort = 'default' THEN created_at END ASC,
        CASE WHEN p_sort = 'created' THEN created_at END DESC,
        CASE WHEN p_sort = 'lastActivity' THEN last_activity_at END DESC,
        CASE WHEN p_sort = 'status' THEN status END ASC,
        CASE WHEN p_sort = 'category' THEN category END ASC,
        CASE WHEN p_sort IN ('status', 'category') THEN created_at END DESC,
        CASE WHEN p_sort = 'unread' THEN unread::integer END DESC,
        CASE WHEN p_sort = 'unread' THEN created_at END DESC,
        id ASC
      ) FROM page_rows
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'open', stats.open,
      'inProgress', stats.in_progress,
      'resolved', stats.resolved,
      'unanswered', stats.unanswered,
      'avgFirstResponseHours', stats.avg_first_response_hours
    ),
    'page', page_info.page,
    'pageSize', 10,
    'total', page_info.total,
    'totalPages', greatest(1, ceil(page_info.total::numeric / 10)::integer)
  ) INTO v_result
  FROM page_info CROSS JOIN stats;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.get_admin_support_queue(integer, text, text, boolean, boolean, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.get_admin_support_queue(integer, text, text, boolean, boolean, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_support_queue(
  p_page integer,
  p_category text,
  p_status text,
  p_assigned_to_me boolean,
  p_unread_only boolean,
  p_search text,
  p_sort text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT app_private.get_admin_support_queue(
    p_page, p_category, p_status, p_assigned_to_me, p_unread_only, p_search, p_sort
  );
$function$;

REVOKE ALL ON FUNCTION public.get_admin_support_queue(integer, text, text, boolean, boolean, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_support_queue(integer, text, text, boolean, boolean, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
