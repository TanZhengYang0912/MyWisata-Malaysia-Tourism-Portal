-- ============================================================
-- Migration 004 — Audit + Notification RPCs (SECURITY DEFINER)
--
-- Fixes the RLS blocker: audit_logs and notifications have RLS enabled
-- but no INSERT policies, so client inserts silently fail.
--
-- Design: expose a single RPC that inserts both in one transaction,
-- with defence-in-depth checks on notification recipient.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- record_audit_and_notify — atomic audit + N notifications
-- Caller identity = auth.uid(); no impersonation possible.
-- Regular users can only notify themselves; admins can notify anyone.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_audit_and_notify(
  p_action        VARCHAR,
  p_entity_type   VARCHAR,
  p_entity_id     UUID,
  p_before_data   JSONB DEFAULT NULL,
  p_after_data    JSONB DEFAULT NULL,
  p_note          TEXT  DEFAULT NULL,
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

  -- Insert audit log
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (v_actor_id, p_action, p_entity_type, p_entity_id, p_before_data, p_after_data, p_note)
  RETURNING id INTO v_audit_id;

  -- Insert each notification with recipient check
  FOR v_notif IN SELECT * FROM jsonb_array_elements(p_notifications)
  LOOP
    v_recipient := (v_notif->>'user_id')::UUID;

    IF v_recipient IS NULL THEN
      RAISE EXCEPTION 'Notification user_id is required';
    END IF;

    IF v_recipient != v_actor_id AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Cannot notify user % without admin role', v_recipient;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      v_recipient,
      v_notif->>'type',
      v_notif->>'title',
      v_notif->>'body',
      v_notif->>'link'
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


-- ─────────────────────────────────────────────────────────────
-- send_notification — single notification without audit log
-- Same recipient check as above.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION send_notification(
  p_user_id UUID,
  p_type    VARCHAR,
  p_title   VARCHAR,
  p_body    TEXT DEFAULT NULL,
  p_link    TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_new_id   UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id != v_actor_id AND NOT is_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Cannot send notification to another user';
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (p_user_id, p_type, p_title, p_body, p_link)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION send_notification TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- Fill missing INSERT policies exposed by RLS audit
-- ─────────────────────────────────────────────────────────────

-- idempotency_keys: withIdempotency() writes rows on behalf of the caller
CREATE POLICY idempotency_insert_own ON idempotency_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- affiliate_links: KYC'd customers generate their own link
CREATE POLICY affiliate_insert_own ON affiliate_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- Partial unique index — prevents duplicate role assignments
--
-- Existing UNIQUE(user_id, role_id, vendor_id, outlet_id) does NOT
-- dedupe rows where vendor_id/outlet_id are both NULL, because
-- SQL treats NULL != NULL. This partial index fixes that so the
-- auth trigger + seed script don't create two 'customer' rows.
-- ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_global
  ON user_roles (user_id, role_id)
  WHERE vendor_id IS NULL AND outlet_id IS NULL;
