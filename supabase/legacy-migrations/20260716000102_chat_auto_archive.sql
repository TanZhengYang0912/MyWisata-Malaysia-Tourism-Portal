-- 6.2.6: auto-archive chats idle past an admin-configurable threshold
-- (default 90 days). Status-only — messages are never touched.

INSERT INTO platform_settings (key, value, description)
SELECT 'chat.archive_days', '90', 'Days of inactivity before an open chat thread is auto-archived'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'chat.archive_days');

CREATE OR REPLACE FUNCTION archive_inactive_chats(days INT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  WITH archived AS (
    UPDATE chat_threads
    SET status = 'archived', archived_at = now()
    WHERE status = 'open'
      AND COALESCE(last_message_at, created_at) < now() - (days || ' days')::interval
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM archived;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION archive_inactive_chats(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION archive_inactive_chats(INT) TO service_role;
