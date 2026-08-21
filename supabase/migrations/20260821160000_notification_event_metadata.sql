-- Preserve structured notification arguments so clients can localize event
-- messages without parsing already-rendered English text.

CREATE OR REPLACE FUNCTION record_audit_and_notify(
  p_action        VARCHAR,
  p_entity_type   VARCHAR,
  p_entity_id     UUID,
  p_before_data   JSONB DEFAULT NULL,
  p_after_data    JSONB DEFAULT NULL,
  p_note          TEXT DEFAULT NULL,
  p_notifications JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id     UUID := auth.uid();
  v_is_admin     BOOLEAN;
  v_audit_id     UUID;
  v_notif        JSONB;
  v_recipient    UUID;
  v_notif_count  INT := 0;
  v_notif_ids    UUID[] := ARRAY[]::UUID[];
  v_new_id       UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_admin := is_admin(v_actor_id);

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (v_actor_id, p_action, p_entity_type, p_entity_id, p_before_data, p_after_data, p_note)
  RETURNING id INTO v_audit_id;

  FOR v_notif IN SELECT * FROM jsonb_array_elements(p_notifications)
  LOOP
    v_recipient := (v_notif->>'user_id')::UUID;

    IF v_recipient IS NULL THEN
      RAISE EXCEPTION 'Notification user_id is required';
    END IF;

    IF v_recipient != v_actor_id AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Cannot notify user % without admin role', v_recipient;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    VALUES (
      v_recipient,
      v_notif->>'type',
      v_notif->>'title',
      v_notif->>'body',
      v_notif->>'link',
      COALESCE(v_notif->'metadata', '{}'::JSONB)
    )
    RETURNING id INTO v_new_id;

    v_notif_ids   := array_append(v_notif_ids, v_new_id);
    v_notif_count := v_notif_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'audit_id',           v_audit_id,
    'notification_ids',   v_notif_ids,
    'notification_count', v_notif_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_audit_and_notify TO authenticated;
