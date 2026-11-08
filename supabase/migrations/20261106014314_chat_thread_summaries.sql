-- Chat lists read one summary row per thread instead of every message.
--
-- The customer chat list polled every 3s for every thread with every message
-- and every read receipt; the vendor inbox did the same on each reconcile.
-- Both only need the latest message and an unread count per thread.
--
-- Access: these functions take the caller and scope as arguments, so only the
-- service role may execute them. The API routes authenticate the user (and,
-- for vendors, run authorizeVendor to get the permitted outlet IDs) before
-- calling them with the service client, the same boundary the routes already
-- use for their service-client reads.

CREATE OR REPLACE FUNCTION public.get_chat_thread_summaries(
  p_user_id uuid,
  p_outlet_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  customer_id uuid,
  outlet_id uuid,
  vendor_id uuid,
  status text,
  last_message_at timestamptz,
  created_at timestamptz,
  outlet_name text,
  outlet_city text,
  outlet_state text,
  customer_full_name text,
  customer_email text,
  latest_message jsonb,
  unread_count integer,
  muted boolean
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- p_outlet_ids NULL: the customer's own threads. Otherwise: the vendor
  -- view of exactly those outlets. Unread matches countUnreadMessages in
  -- lib/customer/chat-view.ts: the counterpart's messages without a read row
  -- from p_user_id (customer view: anything not sent by the customer; vendor
  -- view: messages sent by the customer).
  SELECT
    t.id,
    t.customer_id,
    t.outlet_id,
    t.vendor_id,
    t.status::text,
    t.last_message_at,
    t.created_at,
    o.name::text,
    o.city::text,
    o.state::text,
    u.full_name::text,
    u.email::text,
    latest.message,
    COALESCE(unread.n, 0),
    EXISTS (
      SELECT 1 FROM public.chat_thread_mutes AS mute
      WHERE mute.thread_id = t.id AND mute.user_id = p_user_id
    )
  FROM public.chat_threads AS t
  LEFT JOIN public.outlets AS o ON o.id = t.outlet_id
  LEFT JOIN public.users AS u ON u.id = t.customer_id
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id', m.id,
      'sender_id', m.sender_id,
      'body', m.body,
      'created_at', m.created_at,
      'attachment_url', m.attachment_url,
      'reply_to_message_id', m.reply_to_message_id,
      'context_product_id', m.context_product_id,
      'context_snapshot', m.context_snapshot
    ) AS message
    FROM public.chat_messages AS m
    WHERE m.thread_id = t.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) AS latest ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS n
    FROM public.chat_messages AS m
    WHERE m.thread_id = t.id
      AND CASE WHEN p_outlet_ids IS NULL THEN m.sender_id <> t.customer_id ELSE m.sender_id = t.customer_id END
      AND NOT EXISTS (
        SELECT 1 FROM public.chat_message_reads AS r
        WHERE r.message_id = m.id AND r.user_id = p_user_id
      )
  ) AS unread ON true
  WHERE CASE
    WHEN p_outlet_ids IS NULL THEN t.customer_id = p_user_id
    ELSE t.outlet_id = ANY (p_outlet_ids)
  END
  ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_chat_thread_summaries(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_thread_summaries(uuid, uuid[]) TO service_role;

-- Mark a thread read in one statement instead of loading every message ID
-- and every existing read row first. The route still checks participation.
CREATE OR REPLACE FUNCTION public.mark_chat_thread_read(p_user_id uuid, p_thread_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.chat_message_reads (message_id, user_id)
  SELECT m.id, p_user_id
  FROM public.chat_messages AS m
  WHERE m.thread_id = p_thread_id
    AND m.sender_id <> p_user_id
  ON CONFLICT (message_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_thread_read(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_chat_thread_read(uuid, uuid) TO service_role;
