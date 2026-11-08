CREATE OR REPLACE FUNCTION app_private.mark_vendor_announcements_read(p_announcement_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_announcement_ids IS NULL
    OR pg_catalog.cardinality(p_announcement_ids) < 1
    OR pg_catalog.cardinality(p_announcement_ids) > 10000
  THEN
    RAISE EXCEPTION 'invalid_batch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_announcement_ids) AS selected(announcement_id)
    LEFT JOIN public.vendor_announcements AS announcement
      ON announcement.id = selected.announcement_id
    WHERE announcement.id IS NULL
  ) THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  INSERT INTO public.vendor_announcement_reads (announcement_id, user_id)
  SELECT DISTINCT selected.announcement_id, v_user_id
  FROM pg_catalog.unnest(p_announcement_ids) AS selected(announcement_id)
  ON CONFLICT (announcement_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION app_private.mark_vendor_announcements_read(UUID[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.mark_vendor_announcements_read(UUID[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_vendor_announcements_read(p_announcement_ids UUID[])
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT app_private.mark_vendor_announcements_read(p_announcement_ids);
$function$;

REVOKE ALL ON FUNCTION public.mark_vendor_announcements_read(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_vendor_announcements_read(UUID[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.mark_vendor_announcements_unread(p_announcement_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_announcement_ids IS NULL
    OR pg_catalog.cardinality(p_announcement_ids) < 1
    OR pg_catalog.cardinality(p_announcement_ids) > 10000
  THEN
    RAISE EXCEPTION 'invalid_batch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(p_announcement_ids) AS selected(announcement_id)
    LEFT JOIN public.vendor_announcements AS announcement
      ON announcement.id = selected.announcement_id
    WHERE announcement.id IS NULL
  ) THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  DELETE FROM public.vendor_announcement_reads AS announcement_read
  WHERE announcement_read.user_id = v_user_id
    AND announcement_read.announcement_id = ANY (p_announcement_ids);
END;
$$;

REVOKE ALL ON FUNCTION app_private.mark_vendor_announcements_unread(UUID[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.mark_vendor_announcements_unread(UUID[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_vendor_announcements_unread(p_announcement_ids UUID[])
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT app_private.mark_vendor_announcements_unread(p_announcement_ids);
$function$;

REVOKE ALL ON FUNCTION public.mark_vendor_announcements_unread(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_vendor_announcements_unread(UUID[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
