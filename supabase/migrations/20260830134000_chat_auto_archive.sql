-- Restore the production Chat maintenance operation as a status-only,
-- service-role-only forward migration. Message history is never deleted.
INSERT INTO public.platform_settings (key, value, description)
VALUES ('chat.archive_days', '90', 'Days of inactivity before an open chat thread is auto-archived')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.archive_inactive_chats(days INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF days IS NULL OR days < 1 OR days > 3650 THEN
    RAISE EXCEPTION 'archive_days_out_of_range';
  END IF;

  WITH archived AS (
    UPDATE public.chat_threads
    SET status = 'archived', archived_at = now()
    WHERE status = 'open'
      AND COALESCE(last_message_at, created_at) < now() - make_interval(days => days)
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM archived;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_inactive_chats(INT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_inactive_chats(INT) TO service_role;

NOTIFY pgrst, 'reload schema';
