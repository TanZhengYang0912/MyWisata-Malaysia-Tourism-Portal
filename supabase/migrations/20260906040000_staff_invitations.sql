-- Governed Staff invitation and least-privilege identity boundary.

INSERT INTO public.roles (name, description)
VALUES ('staff', 'Least-privilege employee shell; capabilities come from Staff Role assignments')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

CREATE TABLE public.staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_email TEXT NOT NULL,
  claimed_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  staff_role_id UUID NOT NULL REFERENCES public.staff_roles(id) ON DELETE RESTRICT,
  role_name_snapshot TEXT NOT NULL,
  permission_keys_snapshot TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  revoked_reason TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed')),
  send_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (send_attempt_count >= 0),
  last_attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_invitation_email_valid CHECK (
    invited_email = lower(btrim(invited_email))
    AND char_length(invited_email) BETWEEN 3 AND 254
    AND invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT staff_invitation_reason_valid
    CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  CONSTRAINT staff_invitation_revoked_reason_valid
    CHECK (revoked_reason IS NULL OR char_length(btrim(revoked_reason)) BETWEEN 10 AND 500),
  CONSTRAINT staff_invitation_token_hash_valid
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT staff_invitation_expiry_valid CHECK (expires_at > created_at),
  CONSTRAINT staff_invitation_completion_valid CHECK (
    (status = 'accepted'
      AND claimed_by IS NOT NULL
      AND accepted_by = claimed_by
      AND accepted_at IS NOT NULL
      AND revoked_by IS NULL
      AND revoked_at IS NULL
      AND revoked_reason IS NULL)
    OR
    (status = 'revoked'
      AND accepted_by IS NULL
      AND accepted_at IS NULL
      AND revoked_by IS NOT NULL
      AND revoked_at IS NOT NULL
      AND revoked_reason IS NOT NULL)
    OR
    (status = 'pending'
      AND accepted_by IS NULL
      AND accepted_at IS NULL
      AND revoked_by IS NULL
      AND revoked_at IS NULL
      AND revoked_reason IS NULL)
  )
);

CREATE UNIQUE INDEX staff_invitations_one_pending_email
  ON public.staff_invitations (lower(invited_email))
  WHERE status = 'pending';

CREATE INDEX staff_invitations_claimed_by_idx
  ON public.staff_invitations (claimed_by)
  WHERE claimed_by IS NOT NULL;

CREATE INDEX staff_invitations_created_at_idx
  ON public.staff_invitations (created_at DESC);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_invitations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.staff_invitations TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_staff_invitation(
  p_invited_email TEXT,
  p_staff_role_id UUID,
  p_reason TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_email TEXT := lower(btrim(COALESCE(p_invited_email, '')));
  v_role public.staff_roles%ROWTYPE;
  v_permission_keys TEXT[];
  v_existing_user public.users%ROWTYPE;
  v_claimed_by UUID;
  v_invitation_id UUID;
BEGIN
  v_actor := public.require_active_global_staff_super_admin();
  PERFORM public.validate_staff_reason(p_reason);

  IF char_length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'staff_invitation_email_invalid';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'staff_invitation_token_invalid';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() OR p_expires_at > now() + INTERVAL '7 days' THEN
    RAISE EXCEPTION 'staff_invitation_expiry_invalid';
  END IF;

  SELECT * INTO v_role
    FROM public.staff_roles
   WHERE id = p_staff_role_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_role_not_found'; END IF;
  IF NOT v_role.is_active THEN RAISE EXCEPTION 'staff_role_inactive'; END IF;
  IF v_role.is_system THEN RAISE EXCEPTION 'system_role_template_only'; END IF;

  PERFORM 1
    FROM public.staff_invitations
   WHERE lower(invited_email) = v_email
     AND status = 'pending'
   FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'staff_invitation_pending_exists'; END IF;

  SELECT * INTO v_existing_user
    FROM public.users
   WHERE lower(email) = v_email
   FOR UPDATE;
  IF FOUND THEN
    IF EXISTS (
      SELECT 1
        FROM public.user_roles AS role_assignment
       WHERE role_assignment.user_id = v_existing_user.id
    ) THEN
      RAISE EXCEPTION 'staff_invitation_identity_has_role';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM public.staff_invitations AS previous_invitation
       WHERE previous_invitation.claimed_by = v_existing_user.id
         AND lower(previous_invitation.invited_email) = v_email
         AND previous_invitation.status = 'revoked'
    ) THEN
      RAISE EXCEPTION 'staff_invitation_identity_exists';
    END IF;
    v_claimed_by := v_existing_user.id;
  ELSIF EXISTS (SELECT 1 FROM auth.users AS auth_user WHERE lower(auth_user.email) = v_email) THEN
    RAISE EXCEPTION 'staff_invitation_identity_exists';
  END IF;

  SELECT COALESCE(array_agg(permission.key ORDER BY permission.key), ARRAY[]::TEXT[])
    INTO v_permission_keys
    FROM public.staff_role_permissions AS role_permission
    JOIN public.staff_permissions AS permission ON permission.id = role_permission.permission_id
   WHERE role_permission.role_id = v_role.id;

  INSERT INTO public.staff_invitations (
    invited_email, claimed_by, staff_role_id, role_name_snapshot,
    permission_keys_snapshot, invited_by, reason, token_hash, expires_at,
    status, delivery_status, send_attempt_count, last_attempted_at
  ) VALUES (
    v_email, v_claimed_by, v_role.id, v_role.name,
    v_permission_keys, v_actor, btrim(p_reason), p_token_hash, p_expires_at,
    'pending', 'sending', 1, now()
  ) RETURNING id INTO v_invitation_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (
    v_actor,
    'staff.invitation.created',
    'staff_invitation',
    v_invitation_id,
    jsonb_build_object(
      'invitationId', v_invitation_id,
      'invitedEmail', v_email,
      'roleId', v_role.id,
      'roleName', v_role.name,
      'permissionKeys', v_permission_keys,
      'expiresAt', p_expires_at,
      'claimedBy', v_claimed_by
    ),
    btrim(p_reason)
  );

  RETURN jsonb_build_object(
    'id', v_invitation_id,
    'invited_email', v_email,
    'role_name', v_role.name,
    'permission_keys', v_permission_keys,
    'status', 'pending',
    'delivery_status', 'sending',
    'expires_at', p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_staff_invitation_resend(
  p_invitation_id UUID,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_invitation public.staff_invitations%ROWTYPE;
  v_role public.staff_roles%ROWTYPE;
  v_permission_keys TEXT[];
BEGIN
  v_actor := public.require_active_global_staff_super_admin();
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'staff_invitation_token_invalid';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() OR p_expires_at > now() + INTERVAL '7 days' THEN
    RAISE EXCEPTION 'staff_invitation_expiry_invalid';
  END IF;

  SELECT * INTO v_invitation
    FROM public.staff_invitations
   WHERE id = p_invitation_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_invitation_not_found'; END IF;
  IF v_invitation.status <> 'pending' THEN RAISE EXCEPTION 'staff_invitation_terminal'; END IF;
  IF v_invitation.last_attempted_at IS NOT NULL
     AND v_invitation.last_attempted_at > now() - INTERVAL '60 seconds' THEN
    RAISE EXCEPTION 'staff_invitation_resend_cooldown';
  END IF;

  SELECT * INTO v_role
    FROM public.staff_roles
   WHERE id = v_invitation.staff_role_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_role_not_found'; END IF;
  IF NOT v_role.is_active THEN RAISE EXCEPTION 'staff_role_inactive'; END IF;
  IF v_role.is_system THEN RAISE EXCEPTION 'system_role_template_only'; END IF;

  SELECT COALESCE(array_agg(permission.key ORDER BY permission.key), ARRAY[]::TEXT[])
    INTO v_permission_keys
    FROM public.staff_role_permissions AS role_permission
    JOIN public.staff_permissions AS permission ON permission.id = role_permission.permission_id
   WHERE role_permission.role_id = v_role.id;

  UPDATE public.staff_invitations
     SET token_hash = p_token_hash,
         expires_at = p_expires_at,
         role_name_snapshot = v_role.name,
         permission_keys_snapshot = v_permission_keys,
         delivery_status = 'sending',
         send_attempt_count = send_attempt_count + 1,
         last_attempted_at = now(),
         sent_at = NULL,
         updated_at = now()
   WHERE id = v_invitation.id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (
    v_actor,
    'staff.invitation.resent',
    'staff_invitation',
    v_invitation.id,
    jsonb_build_object('expiresAt', v_invitation.expires_at, 'attempt', v_invitation.send_attempt_count),
    jsonb_build_object('expiresAt', p_expires_at, 'attempt', v_invitation.send_attempt_count + 1)
  );

  RETURN jsonb_build_object(
    'id', v_invitation.id,
    'invited_email', v_invitation.invited_email,
    'role_name', v_role.name,
    'permission_keys', v_permission_keys,
    'status', 'pending',
    'delivery_status', 'sending',
    'expires_at', p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_staff_invitation_delivery(
  p_invitation_id UUID,
  p_token_hash TEXT,
  p_succeeded BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_invitation public.staff_invitations%ROWTYPE;
BEGIN
  v_actor := public.require_active_global_staff_super_admin();
  SELECT * INTO v_invitation
    FROM public.staff_invitations
   WHERE id = p_invitation_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_invitation_not_found'; END IF;
  IF v_invitation.status <> 'pending'
     OR v_invitation.token_hash IS DISTINCT FROM p_token_hash
     OR v_invitation.delivery_status <> 'sending' THEN
    RAISE EXCEPTION 'staff_invitation_delivery_stale';
  END IF;

  UPDATE public.staff_invitations
     SET delivery_status = CASE WHEN p_succeeded THEN 'sent' ELSE 'failed' END,
         sent_at = CASE WHEN p_succeeded THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = v_invitation.id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
  VALUES (
    v_actor,
    CASE WHEN p_succeeded THEN 'staff.invitation.delivery_succeeded' ELSE 'staff.invitation.delivery_failed' END,
    'staff_invitation',
    v_invitation.id,
    jsonb_build_object('attempt', v_invitation.send_attempt_count, 'succeeded', p_succeeded)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_staff_invitation(
  p_invitation_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_invitation public.staff_invitations%ROWTYPE;
BEGIN
  v_actor := public.require_active_global_staff_super_admin();
  PERFORM public.validate_staff_reason(p_reason);

  SELECT * INTO v_invitation
    FROM public.staff_invitations
   WHERE id = p_invitation_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_invitation_not_found'; END IF;
  IF v_invitation.status <> 'pending' THEN RAISE EXCEPTION 'staff_invitation_terminal'; END IF;

  UPDATE public.staff_invitations
     SET status = 'revoked',
         revoked_by = v_actor,
         revoked_at = now(),
         revoked_reason = btrim(p_reason),
         updated_at = now()
   WHERE id = v_invitation.id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    v_actor,
    'staff.invitation.revoked',
    'staff_invitation',
    v_invitation.id,
    jsonb_build_object('status', v_invitation.status),
    jsonb_build_object('status', 'revoked'),
    btrim(p_reason)
  );
END;
$$;

-- Self-only access projection for the auth context and Staff home.
CREATE OR REPLACE FUNCTION public.get_my_staff_access()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH active_assignments AS (
    SELECT staff_role.id, staff_role.name
      FROM public.staff_role_assignments AS assignment
      JOIN public.staff_roles AS staff_role ON staff_role.id = assignment.role_id
     WHERE assignment.user_id = auth.uid()
       AND assignment.revoked_at IS NULL
       AND staff_role.is_active = TRUE
  ), effective_permissions AS (
    SELECT DISTINCT permission.key
      FROM active_assignments AS active_assignment
      JOIN public.staff_role_permissions AS role_permission ON role_permission.role_id = active_assignment.id
      JOIN public.staff_permissions AS permission ON permission.id = role_permission.permission_id
  )
  SELECT jsonb_build_object(
    'roleNames', COALESCE((SELECT jsonb_agg(name ORDER BY name) FROM active_assignments), '[]'::JSONB),
    'permissionKeys', COALESCE((SELECT jsonb_agg(key ORDER BY key) FROM effective_permissions), '[]'::JSONB)
  )
  WHERE auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.accept_staff_invitation(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_auth_email TEXT;
  v_email_confirmed_at TIMESTAMPTZ;
  v_invitation public.staff_invitations%ROWTYPE;
  v_public_user public.users%ROWTYPE;
  v_role public.staff_roles%ROWTYPE;
  v_permission_keys TEXT[];
  v_staff_role_id INTEGER;
  v_assignment_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_invitation
    FROM public.staff_invitations
   WHERE token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_invitation'; END IF;
  IF v_invitation.status <> 'pending' THEN RAISE EXCEPTION 'already_used'; END IF;
  IF v_invitation.expires_at <= now() THEN RAISE EXCEPTION 'invitation_expired'; END IF;

  SELECT email, email_confirmed_at INTO v_auth_email, v_email_confirmed_at
    FROM auth.users
   WHERE id = v_user_id;
  IF v_email_confirmed_at IS NULL THEN RAISE EXCEPTION 'email_not_verified'; END IF;
  IF lower(btrim(v_auth_email)) IS DISTINCT FROM lower(btrim(v_invitation.invited_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;
  IF v_invitation.claimed_by IS DISTINCT FROM v_user_id THEN RAISE EXCEPTION 'identity_mismatch'; END IF;
  SELECT * INTO v_public_user
    FROM public.users
   WHERE id = v_user_id
   FOR UPDATE;
  IF NOT FOUND OR v_public_user.status <> 'active' THEN
    RAISE EXCEPTION 'staff_identity_inactive';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'staff_identity_has_role';
  END IF;

  SELECT * INTO v_role
    FROM public.staff_roles
   WHERE id = v_invitation.staff_role_id
   FOR UPDATE;
  IF NOT FOUND OR NOT v_role.is_active THEN RAISE EXCEPTION 'staff_role_unavailable'; END IF;
  IF v_role.is_system THEN RAISE EXCEPTION 'staff_role_unavailable'; END IF;

  SELECT COALESCE(array_agg(permission.key ORDER BY permission.key), ARRAY[]::TEXT[])
    INTO v_permission_keys
    FROM public.staff_role_permissions AS role_permission
    JOIN public.staff_permissions AS permission ON permission.id = role_permission.permission_id
   WHERE role_permission.role_id = v_role.id;
  IF v_role.name IS DISTINCT FROM v_invitation.role_name_snapshot
     OR v_invitation.permission_keys_snapshot IS DISTINCT FROM v_permission_keys THEN
    RAISE EXCEPTION 'staff_role_changed';
  END IF;

  SELECT id INTO v_staff_role_id FROM public.roles AS role_row WHERE role_row.name = 'staff';
  IF v_staff_role_id IS NULL THEN RAISE EXCEPTION 'staff_role_missing'; END IF;

  INSERT INTO public.user_roles (user_id, role_id, vendor_id, outlet_id)
  VALUES (v_user_id, v_staff_role_id, NULL, NULL);

  INSERT INTO public.staff_role_assignments (role_id, user_id, assigned_by)
  VALUES (v_role.id, v_user_id, v_invitation.invited_by)
  RETURNING id INTO v_assignment_id;

  UPDATE public.staff_invitations
     SET status = 'accepted',
         accepted_by = v_user_id,
         accepted_at = now(),
         updated_at = now()
   WHERE id = v_invitation.id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (
    v_user_id,
    'staff.invitation.accepted',
    'staff_invitation',
    v_invitation.id,
    jsonb_build_object('invitationId', v_invitation.id, 'roleId', v_role.id, 'userId', v_user_id),
    'Accepted Staff invitation'
  );
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (
    v_invitation.invited_by,
    'staff.role.assigned',
    'staff_role_assignment',
    v_assignment_id,
    jsonb_build_object('assignmentId', v_assignment_id, 'roleId', v_role.id, 'userId', v_user_id),
    v_invitation.reason
  );

  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'assignment_id', v_assignment_id,
    'user_id', v_user_id,
    'role_id', v_role.id
  );
END;
$$;

-- Matching Staff invite registrations are claimed but receive no application
-- role until the verified recipient accepts. All other signups stay Customer.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_staff_invitation_id UUID;
BEGIN
  PERFORM set_config('app.allow_verification_write', 'on', true);

  SELECT invitation.id INTO v_staff_invitation_id
    FROM public.staff_invitations AS invitation
   WHERE lower(invitation.invited_email) = lower(btrim(NEW.email))
     AND invitation.status = 'pending'
     AND invitation.expires_at > now()
     AND invitation.claimed_by IS NULL
   ORDER BY invitation.created_at DESC
   LIMIT 1
   FOR UPDATE;

  INSERT INTO public.users (
    id, email, full_name, email_verified_at, tier, created_at, updated_at
  ) VALUES (
    NEW.id,
    lower(btrim(NEW.email)),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NEW.email_confirmed_at,
    CASE WHEN NEW.email_confirmed_at IS NULL THEN 'email_unverified' ELSE 'email_verified' END,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.users.full_name, EXCLUDED.full_name),
    email_verified_at = COALESCE(public.users.email_verified_at, EXCLUDED.email_verified_at),
    tier = CASE
      WHEN public.tier_rank(public.users.tier) >= 1 THEN public.users.tier
      WHEN EXCLUDED.email_verified_at IS NOT NULL THEN 'email_verified'
      ELSE 'email_unverified'
    END,
    updated_at = now();

  INSERT INTO public.wallets (user_id) VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  IF v_staff_invitation_id IS NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT NEW.id, r.id FROM public.roles AS r WHERE r.name = 'customer'
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.staff_invitations
       SET claimed_by = NEW.id,
           updated_at = now()
     WHERE id = v_staff_invitation_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
    VALUES (
      NEW.id,
      'staff.invitation.claimed',
      'staff_invitation',
      v_staff_invitation_id,
      jsonb_build_object('claimedBy', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Preserve the legacy broad-role results, but require the dedicated permission
-- for the new Staff identity. This does not change public.is_admin().
CREATE OR REPLACE FUNCTION public.has_staff_permission(
  p_user_id UUID,
  p_permission_key TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL
     OR p_permission_key IS NULL
     OR (
       COALESCE(auth.role(), '') <> 'service_role'
       AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid())
     ) THEN
    RETURN FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_permissions WHERE key = p_permission_key) THEN
    RETURN FALSE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users AS user_row
     WHERE user_row.id = p_user_id AND user_row.status = 'active'
  ) THEN
    RETURN FALSE;
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles AS coarse_assignment
      JOIN public.roles AS legacy_role ON legacy_role.id = coarse_assignment.role_id
     WHERE coarse_assignment.user_id = p_user_id
       AND coarse_assignment.vendor_id IS NULL
       AND coarse_assignment.outlet_id IS NULL
       AND legacy_role.name IN ('admin', 'approver', 'super_admin', 'staff')
  ) THEN
    RETURN FALSE;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.user_roles AS legacy_assignment
      JOIN public.roles AS legacy_role ON legacy_role.id = legacy_assignment.role_id
     WHERE legacy_assignment.user_id = p_user_id
       AND legacy_assignment.vendor_id IS NULL
       AND legacy_assignment.outlet_id IS NULL
       AND legacy_role.name = 'super_admin'
  ) THEN
    RETURN TRUE;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.user_roles AS legacy_assignment
      JOIN public.roles AS legacy_role ON legacy_role.id = legacy_assignment.role_id
     WHERE legacy_assignment.user_id = p_user_id
       AND legacy_assignment.vendor_id IS NULL
       AND legacy_assignment.outlet_id IS NULL
       AND legacy_role.name = 'admin'
  ) AND p_permission_key IN ('admin.kyc.review', 'admin.vendor.manage') THEN
    RETURN TRUE;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.user_roles AS legacy_assignment
      JOIN public.roles AS legacy_role ON legacy_role.id = legacy_assignment.role_id
     WHERE legacy_assignment.user_id = p_user_id
       AND legacy_assignment.vendor_id IS NULL
       AND legacy_assignment.outlet_id IS NULL
       AND legacy_role.name = 'approver'
  ) AND p_permission_key = 'admin.withdrawal.approve' THEN
    RETURN TRUE;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.staff_role_assignments AS role_assignment
      JOIN public.staff_roles AS staff_role ON staff_role.id = role_assignment.role_id
      JOIN public.staff_role_permissions AS role_permission ON role_permission.role_id = staff_role.id
      JOIN public.staff_permissions AS permission ON permission.id = role_permission.permission_id
     WHERE role_assignment.user_id = p_user_id
       AND role_assignment.revoked_at IS NULL
       AND staff_role.is_active = TRUE
       AND permission.key = p_permission_key
  );
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles AS assignment
    JOIN public.roles AS role_row ON role_row.id = assignment.role_id
    WHERE assignment.user_id = uid
      AND role_row.name IN ('super_admin', 'approver')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_review_kyc(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.has_staff_permission(uid, 'admin.kyc.review');
$$;

CREATE OR REPLACE FUNCTION public.is_approver(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles AS assignment
    JOIN public.roles AS role_row ON role_row.id = assignment.role_id
    WHERE assignment.user_id = uid
      AND role_row.name IN ('super_admin', 'approver')
  );
$$;

CREATE OR REPLACE FUNCTION public.assign_staff_role(
  p_role_id UUID,
  p_user_id UUID,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_role public.staff_roles%ROWTYPE;
  v_assignment_id UUID;
BEGIN
  v_actor := public.require_active_global_staff_super_admin();
  PERFORM public.validate_staff_reason(p_reason);
  IF p_role_id IS NULL OR p_user_id IS NULL THEN RAISE EXCEPTION 'staff_assignment_target_required'; END IF;

  SELECT * INTO v_role FROM public.staff_roles WHERE id = p_role_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_role_not_found'; END IF;
  IF NOT v_role.is_active THEN RAISE EXCEPTION 'staff_role_inactive'; END IF;
  IF v_role.is_system THEN RAISE EXCEPTION 'system_role_template_only'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users AS target_user
     WHERE target_user.id = p_user_id AND target_user.status = 'active'
  ) THEN RAISE EXCEPTION 'staff_assignment_target_not_active'; END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles AS legacy_assignment
      JOIN public.roles AS legacy_role ON legacy_role.id = legacy_assignment.role_id
     WHERE legacy_assignment.user_id = p_user_id
       AND legacy_assignment.vendor_id IS NULL
       AND legacy_assignment.outlet_id IS NULL
       AND legacy_role.name IN ('admin', 'approver', 'super_admin', 'staff')
  ) THEN RAISE EXCEPTION 'coarse_staff_role_required'; END IF;

  INSERT INTO public.staff_role_assignments (role_id, user_id, assigned_by)
  VALUES (p_role_id, p_user_id, v_actor)
  RETURNING id INTO v_assignment_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (
    v_actor,
    'staff.role.assigned',
    'staff_role_assignment',
    v_assignment_id,
    jsonb_build_object('assignmentId', v_assignment_id, 'roleId', p_role_id, 'userId', p_user_id),
    btrim(p_reason)
  );
  RETURN v_assignment_id;
END;
$$;

-- Upgrade only the four withdrawal-review functions and the KYC review audit
-- role projection. Generic legacy predicates stay narrow so payout execution,
-- retry, reports, and other admin surfaces do not become Staff-accessible.
DO $$
DECLARE
  v_oid OID;
  v_definition TEXT;
  v_updated TEXT;
BEGIN
  FOR v_oid IN
    SELECT procedure.oid
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
     WHERE namespace.nspname = 'public'
       AND procedure.proname IN (
         'hold_wallet_withdrawal',
         'reject_wallet_withdrawal',
         'resume_wallet_withdrawal',
         'get_withdrawal_review_sources'
       )
  LOOP
    v_definition := pg_get_functiondef(v_oid);
    v_updated := replace(
      replace(
        v_definition,
        'public.is_approver(v_actor)',
        'public.has_staff_permission(v_actor, ''admin.withdrawal.approve'')'
      ),
      'is_approver(auth.uid())',
      'public.has_staff_permission(auth.uid(), ''admin.withdrawal.approve'')'
    );
    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'staff_withdrawal_guard_upgrade_failed:%', v_oid::regprocedure;
    END IF;
    EXECUTE v_updated;
  END LOOP;

  SELECT procedure.oid INTO v_oid
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'public'
     AND procedure.proname = 'admin_review_kyc'
     AND pg_get_function_identity_arguments(procedure.oid) = 'p_submission_id uuid, p_user_id uuid, p_action text, p_reason_code text, p_reason_detail text';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'staff_kyc_guard_upgrade_failed:function_missing'; END IF;
  v_definition := pg_get_functiondef(v_oid);
  v_updated := replace(
    v_definition,
    'role_row.name IN (''admin'', ''approver'', ''super_admin'')',
    'role_row.name IN (''admin'', ''approver'', ''staff'', ''super_admin'')'
  );
  IF v_updated = v_definition THEN RAISE EXCEPTION 'staff_kyc_guard_upgrade_failed:actor_role'; END IF;
  EXECUTE v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_staff_invitation(TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prepare_staff_invitation_resend(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_staff_invitation_delivery(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_staff_invitation(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_staff_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_staff_invitation(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_staff_permission(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_review_kyc(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_approver(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.prepare_staff_invitation(TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_staff_invitation_resend(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_staff_invitation_delivery(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_staff_invitation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_staff_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_review_kyc(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_approver(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
