-- Dedicated Staff RBAC boundary.
--
-- The legacy roles table remains the coarse account classification used by
-- existing modules. These normalized tables are the source of truth for
-- configurable staff capabilities and are deliberately reachable through
-- governed RPCs only.

CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_permissions_key_format
    CHECK (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
);

CREATE TABLE IF NOT EXISTS public.staff_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_role_permissions (
  role_id UUID NOT NULL REFERENCES public.staff_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.staff_permissions(id) ON DELETE RESTRICT,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.staff_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.staff_roles(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_role_assignments_live_unique
  ON public.staff_role_assignments (role_id, user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_role_assignments_user_live_idx
  ON public.staff_role_assignments (user_id)
  WHERE revoked_at IS NULL;

-- The permission catalogue is server-owned. Future permissions are added by a
-- forward migration, never by a browser-originating write.
INSERT INTO public.staff_permissions (key, module, action, description, is_system)
VALUES
  ('admin.kyc.review', 'admin', 'kyc.review', 'Review and decide KYC submissions', TRUE),
  ('admin.withdrawal.approve', 'admin', 'withdrawal.approve', 'Approve wallet withdrawal requests', TRUE),
  ('admin.vendor.manage', 'admin', 'vendor.manage', 'Approve or suspend vendors', TRUE),
  ('admin.map_campaign.manage', 'admin', 'map_campaign.manage', 'Manage sponsored map campaigns', TRUE)
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_system = TRUE;

-- System roles preserve current coarse-role access while making the new
-- permission boundary explicit. Super Admin remains an implicit grant for all
-- known permissions in has_staff_permission().
INSERT INTO public.staff_roles (name, description, is_system, is_active)
VALUES
  ('Legacy Admin', 'Compatibility role for users with the legacy admin role', TRUE, TRUE),
  ('Legacy Wallet Approver', 'Compatibility role for users with the legacy approver role', TRUE, TRUE)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_system = TRUE,
  is_active = TRUE,
  updated_at = now();

INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT staff_role.id, permission.id
  FROM public.staff_roles AS staff_role
  JOIN public.staff_permissions AS permission
    ON permission.key IN ('admin.kyc.review', 'admin.vendor.manage')
 WHERE staff_role.name = 'Legacy Admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT staff_role.id, permission.id
  FROM public.staff_roles AS staff_role
  JOIN public.staff_permissions AS permission
    ON permission.key = 'admin.withdrawal.approve'
 WHERE staff_role.name = 'Legacy Wallet Approver'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- If this migration is re-run against a partially seeded database, ensure the
-- compatibility roles never inherit the new sponsored-campaign capability.
DELETE FROM public.staff_role_permissions AS role_permission
 USING public.staff_roles AS staff_role,
       public.staff_permissions AS permission
 WHERE role_permission.role_id = staff_role.id
   AND role_permission.permission_id = permission.id
   AND staff_role.name IN ('Legacy Admin', 'Legacy Wallet Approver')
   AND permission.key = 'admin.map_campaign.manage';

-- Preserve existing coarse access for all users already carrying the legacy
-- Admin or Wallet Approver role. Backfilled rows are intentionally attributed
-- to no actor because they are a schema migration, not a browser action.
INSERT INTO public.staff_role_assignments (role_id, user_id, assigned_by)
SELECT DISTINCT staff_role.id, legacy_assignment.user_id, NULL
  FROM public.user_roles AS legacy_assignment
  JOIN public.roles AS legacy_role
    ON legacy_role.id = legacy_assignment.role_id
  JOIN public.staff_roles AS staff_role
    ON staff_role.name = CASE legacy_role.name
      WHEN 'admin' THEN 'Legacy Admin'
      WHEN 'approver' THEN 'Legacy Wallet Approver'
    END
 WHERE legacy_role.name IN ('admin', 'approver')
   AND NOT EXISTS (
     SELECT 1
       FROM public.staff_role_assignments AS existing_assignment
      WHERE existing_assignment.role_id = staff_role.id
        AND existing_assignment.user_id = legacy_assignment.user_id
        AND existing_assignment.revoked_at IS NULL
   );

-- Private validation helpers. They are invoked only by SECURITY DEFINER
-- governance functions below and are not part of the browser API.
CREATE OR REPLACE FUNCTION public.validate_staff_reason(p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_reason IS NULL OR char_length(BTRIM(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'staff_reason_required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_staff_permission_keys(p_permission_keys TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keys TEXT[];
BEGIN
  IF p_permission_keys IS NULL OR EXISTS (
    SELECT 1
      FROM unnest(p_permission_keys) AS requested(permission_key)
     WHERE requested.permission_key IS NULL
        OR requested.permission_key <> BTRIM(requested.permission_key)
        OR NOT EXISTS (
          SELECT 1
            FROM public.staff_permissions AS permission
           WHERE permission.key = requested.permission_key
        )
  ) THEN
    RAISE EXCEPTION 'invalid_permission_key';
  END IF;

  IF EXISTS (
    SELECT requested.permission_key
      FROM unnest(p_permission_keys) AS requested(permission_key)
     GROUP BY requested.permission_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_permission_key';
  END IF;

  SELECT COALESCE(
    array_agg(requested.permission_key ORDER BY requested.permission_key),
    ARRAY[]::TEXT[]
  )
    INTO v_keys
    FROM unnest(p_permission_keys) AS requested(permission_key);
  RETURN v_keys;
END;
$$;

-- A known permission may be resolved by the authenticated user only for that
-- same user's ID. The service role is the sole trusted exception used by
-- server-side maintenance. Every error fails closed.
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

  -- Reject unknown keys before the Super Admin implicit grant. This keeps
  -- typos and future unregistered strings fail-closed for every caller.
  IF NOT EXISTS (
    SELECT 1
      FROM public.staff_permissions AS permission
     WHERE permission.key = p_permission_key
  ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.users AS user_row
     WHERE user_row.id = p_user_id
       AND user_row.status = 'active'
  ) THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.user_roles AS legacy_assignment
      JOIN public.roles AS legacy_role
        ON legacy_role.id = legacy_assignment.role_id
     WHERE legacy_assignment.user_id = p_user_id
       AND legacy_role.name = 'super_admin'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.staff_role_assignments AS role_assignment
      JOIN public.staff_roles AS staff_role
        ON staff_role.id = role_assignment.role_id
      JOIN public.staff_role_permissions AS role_permission
        ON role_permission.role_id = staff_role.id
      JOIN public.staff_permissions AS permission
        ON permission.id = role_permission.permission_id
     WHERE role_assignment.user_id = p_user_id
       AND role_assignment.revoked_at IS NULL
       AND staff_role.is_active = TRUE
       AND permission.key = p_permission_key
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_staff_role(
  p_name TEXT,
  p_description TEXT,
  p_permission_keys TEXT[],
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role_id UUID;
  v_keys TEXT[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_staff_reason(p_reason);
  IF p_name IS NULL OR char_length(BTRIM(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'staff_role_name_required';
  END IF;
  IF p_description IS NOT NULL AND char_length(BTRIM(p_description)) > 1000 THEN
    RAISE EXCEPTION 'staff_role_description_too_long';
  END IF;
  v_keys := public.validate_staff_permission_keys(p_permission_keys);

  INSERT INTO public.staff_roles (name, description, is_system, is_active, created_by)
  VALUES (BTRIM(p_name), NULLIF(BTRIM(p_description), ''), FALSE, TRUE, v_actor)
  RETURNING id INTO v_role_id;

  INSERT INTO public.staff_role_permissions (role_id, permission_id)
  SELECT v_role_id, permission.id
    FROM public.staff_permissions AS permission
   WHERE permission.key = ANY(v_keys);

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'staff.role.created',
    'staff_role',
    v_role_id,
    NULL,
    jsonb_build_object(
      'roleId', v_role_id,
      'permissionKeys', v_keys,
      'isSystem', FALSE,
      'isActive', TRUE
    ),
    BTRIM(p_reason)
  );

  RETURN v_role_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_staff_role(
  p_role_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_permission_keys TEXT[],
  p_active BOOLEAN,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role public.staff_roles%ROWTYPE;
  v_keys TEXT[];
  v_before_keys TEXT[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_staff_reason(p_reason);
  IF p_name IS NULL OR char_length(BTRIM(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'staff_role_name_required';
  END IF;
  IF p_description IS NOT NULL AND char_length(BTRIM(p_description)) > 1000 THEN
    RAISE EXCEPTION 'staff_role_description_too_long';
  END IF;
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'staff_role_active_required';
  END IF;

  SELECT *
    INTO v_role
    FROM public.staff_roles
   WHERE id = p_role_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_role_not_found'; END IF;
  IF v_role.is_system THEN RAISE EXCEPTION 'system_role_protected'; END IF;

  v_keys := public.validate_staff_permission_keys(p_permission_keys);
  SELECT COALESCE(array_agg(permission.key ORDER BY permission.key), ARRAY[]::TEXT[])
    INTO v_before_keys
    FROM public.staff_role_permissions AS role_permission
    JOIN public.staff_permissions AS permission
      ON permission.id = role_permission.permission_id
   WHERE role_permission.role_id = p_role_id;

  UPDATE public.staff_roles
     SET name = BTRIM(p_name),
         description = NULLIF(BTRIM(p_description), ''),
         is_active = p_active,
         updated_at = now()
   WHERE id = p_role_id;

  DELETE FROM public.staff_role_permissions
   WHERE role_id = p_role_id;
  INSERT INTO public.staff_role_permissions (role_id, permission_id)
  SELECT p_role_id, permission.id
    FROM public.staff_permissions AS permission
   WHERE permission.key = ANY(v_keys);

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'staff.role.updated',
    'staff_role',
    p_role_id,
    jsonb_build_object('permissionKeys', v_before_keys, 'isActive', v_role.is_active),
    jsonb_build_object('permissionKeys', v_keys, 'isActive', p_active),
    BTRIM(p_reason)
  );
END;
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
  v_actor UUID := auth.uid();
  v_role public.staff_roles%ROWTYPE;
  v_assignment_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_staff_reason(p_reason);
  IF p_role_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'staff_assignment_target_required';
  END IF;

  SELECT *
    INTO v_role
    FROM public.staff_roles
   WHERE id = p_role_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_role_not_found'; END IF;
  IF v_role.is_system THEN RAISE EXCEPTION 'system_role_protected'; END IF;
  IF NOT v_role.is_active THEN RAISE EXCEPTION 'staff_role_inactive'; END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.users AS target_user
     WHERE target_user.id = p_user_id
       AND target_user.status = 'active'
  ) THEN
    RAISE EXCEPTION 'staff_assignment_target_not_active';
  END IF;

  -- Staff roles are additive capabilities, never a way to manufacture a
  -- coarse staff account. The target must already carry one of the legacy
  -- coarse staff roles.
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles AS legacy_assignment
      JOIN public.roles AS legacy_role
        ON legacy_role.id = legacy_assignment.role_id
     WHERE legacy_assignment.user_id = p_user_id
       AND legacy_role.name IN ('admin', 'approver', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'coarse_staff_role_required';
  END IF;

  INSERT INTO public.staff_role_assignments (role_id, user_id, assigned_by)
  VALUES (p_role_id, p_user_id, v_actor)
  RETURNING id INTO v_assignment_id;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'staff.role.assigned',
    'staff_role_assignment',
    v_assignment_id,
    NULL,
    jsonb_build_object('assignmentId', v_assignment_id, 'roleId', p_role_id, 'userId', p_user_id),
    BTRIM(p_reason)
  );

  RETURN v_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_staff_role_assignment(
  p_assignment_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_assignment public.staff_role_assignments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_staff_reason(p_reason);

  SELECT *
    INTO v_assignment
    FROM public.staff_role_assignments
   WHERE id = p_assignment_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_assignment_not_found'; END IF;
  IF v_assignment.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'staff_assignment_already_revoked';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.staff_roles AS staff_role
     WHERE staff_role.id = v_assignment.role_id
       AND staff_role.is_system
  ) THEN
    RAISE EXCEPTION 'system_role_protected';
  END IF;

  UPDATE public.staff_role_assignments
     SET revoked_at = now()
   WHERE id = p_assignment_id;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'staff.role.revoked',
    'staff_role_assignment',
    p_assignment_id,
    jsonb_build_object('assignmentId', p_assignment_id, 'roleId', v_assignment.role_id, 'userId', v_assignment.user_id, 'revoked', FALSE),
    jsonb_build_object('assignmentId', p_assignment_id, 'roleId', v_assignment.role_id, 'userId', v_assignment.user_id, 'revoked', TRUE),
    BTRIM(p_reason)
  );
END;
$$;

-- RLS gives Super Admins read-only visibility for the management API. There
-- are deliberately no INSERT/UPDATE/DELETE policies; all writes go through
-- the SECURITY DEFINER functions above.
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_permissions_super_admin_read ON public.staff_permissions;
CREATE POLICY staff_permissions_super_admin_read
  ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS staff_roles_super_admin_read ON public.staff_roles;
CREATE POLICY staff_roles_super_admin_read
  ON public.staff_roles
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS staff_role_permissions_super_admin_read ON public.staff_role_permissions;
CREATE POLICY staff_role_permissions_super_admin_read
  ON public.staff_role_permissions
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS staff_role_assignments_super_admin_read ON public.staff_role_assignments;
CREATE POLICY staff_role_assignments_super_admin_read
  ON public.staff_role_assignments
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Browser sessions can read governed state only as Super Admins and cannot
-- mutate any RBAC table directly. Service-role reads support server adapters;
-- writes remain RPC-only as well.
REVOKE ALL ON TABLE public.staff_permissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_role_permissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_role_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.staff_permissions, public.staff_roles,
  public.staff_role_permissions, public.staff_role_assignments TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_staff_reason(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_staff_permission_keys(TEXT[]) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_staff_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_staff_role(TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_staff_role(TEXT, TEXT, TEXT[], TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_staff_role(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staff_role(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assign_staff_role(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_staff_role(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_staff_role_assignment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_staff_role_assignment(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
