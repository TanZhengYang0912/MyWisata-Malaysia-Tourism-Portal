-- Preserve the existing notification permission check and attach only the
-- structured vendor name required by the localized vendor lifecycle templates.
CREATE FUNCTION app_private.send_notification_with_metadata(
  p_user_id uuid,
  p_type character varying,
  p_title character varying,
  p_body text DEFAULT NULL,
  p_link text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notification_id uuid;
  v_vendor_name text;
BEGIN
  IF p_type NOT IN ('vendor_approved', 'vendor_information_requested', 'vendor_rejected', 'vendor_suspended', 'vendor_unsuspended')
     OR p_metadata IS NULL
     OR jsonb_typeof(p_metadata) <> 'object'
     OR (p_metadata - 'vendorName') <> '{}'::jsonb
     OR jsonb_typeof(p_metadata->'vendorName') <> 'string' THEN
    RAISE EXCEPTION 'notification_metadata_invalid' USING ERRCODE = '22023';
  END IF;
  v_vendor_name := btrim(p_metadata->>'vendorName');
  IF length(v_vendor_name) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'notification_metadata_invalid' USING ERRCODE = '22023';
  END IF;

  -- The existing private RPC remains authoritative for self/admin recipient access.
  v_notification_id := app_private.send_notification(p_user_id, p_type, p_title, p_body, p_link);
  UPDATE public.notifications
     SET metadata = jsonb_build_object('vendorName', v_vendor_name)
   WHERE id = v_notification_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification_metadata_target_missing' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.send_notification_with_metadata(uuid, character varying, character varying, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.send_notification_with_metadata(
  p_user_id uuid,
  p_type character varying,
  p_title character varying,
  p_body text DEFAULT NULL,
  p_link text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT app_private.send_notification_with_metadata(p_user_id, p_type, p_title, p_body, p_link, p_metadata);
$$;

REVOKE ALL ON FUNCTION public.send_notification_with_metadata(uuid, character varying, character varying, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_notification_with_metadata(uuid, character varying, character varying, text, text, jsonb)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
