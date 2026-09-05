-- Make reusable Staff RBAC templates practical without weakening their
-- governance boundary. System role definitions remain immutable, while their
-- assignment rows can be governed like custom role assignments.

ALTER TABLE public.staff_roles
  DROP CONSTRAINT IF EXISTS staff_roles_custom_name_length;
ALTER TABLE public.staff_roles
  ADD CONSTRAINT staff_roles_custom_name_length
  CHECK (
    is_system
    OR char_length(BTRIM(name)) BETWEEN 1 AND 20
  );

ALTER TABLE public.staff_roles
  DROP CONSTRAINT IF EXISTS staff_roles_custom_description_length;
ALTER TABLE public.staff_roles
  ADD CONSTRAINT staff_roles_custom_description_length
  CHECK (
    is_system
    OR description IS NULL
    OR char_length(BTRIM(description)) <= 100
  );

CREATE OR REPLACE FUNCTION public.is_active_global_staff_super_admin(
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      COALESCE(auth.role(), '') = 'service_role'
      OR p_user_id IS NOT DISTINCT FROM auth.uid()
    )
    AND EXISTS (
      SELECT 1
        FROM public.users AS actor
       WHERE actor.id = p_user_id
         AND actor.status = 'active'
    )
    AND EXISTS (
      SELECT 1
        FROM public.user_roles AS assignment
        JOIN public.roles AS role
          ON role.id = assignment.role_id
       WHERE assignment.user_id = p_user_id
         AND assignment.vendor_id IS NULL
         AND assignment.outlet_id IS NULL
         AND role.name = 'super_admin'
    );
$$;

REVOKE ALL ON FUNCTION public.is_active_global_staff_super_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_global_staff_super_admin(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS staff_permissions_super_admin_read ON public.staff_permissions;
CREATE POLICY staff_permissions_super_admin_read
  ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (public.is_active_global_staff_super_admin(auth.uid()));

DROP POLICY IF EXISTS staff_roles_super_admin_read ON public.staff_roles;
CREATE POLICY staff_roles_super_admin_read
  ON public.staff_roles
  FOR SELECT TO authenticated
  USING (public.is_active_global_staff_super_admin(auth.uid()));

DROP POLICY IF EXISTS staff_role_permissions_super_admin_read ON public.staff_role_permissions;
CREATE POLICY staff_role_permissions_super_admin_read
  ON public.staff_role_permissions
  FOR SELECT TO authenticated
  USING (public.is_active_global_staff_super_admin(auth.uid()));

DROP POLICY IF EXISTS staff_role_assignments_super_admin_read ON public.staff_role_assignments;
CREATE POLICY staff_role_assignments_super_admin_read
  ON public.staff_role_assignments
  FOR SELECT TO authenticated
  USING (public.is_active_global_staff_super_admin(auth.uid()));

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
  IF p_role_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'staff_assignment_target_required';
  END IF;

  SELECT *
    INTO v_role
    FROM public.staff_roles
   WHERE id = p_role_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_role_not_found'; END IF;
  IF NOT v_role.is_active THEN RAISE EXCEPTION 'staff_role_inactive'; END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.users AS target_user
     WHERE target_user.id = p_user_id
       AND target_user.status = 'active'
  ) THEN
    RAISE EXCEPTION 'staff_assignment_target_not_active';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles AS legacy_assignment
      JOIN public.roles AS legacy_role
        ON legacy_role.id = legacy_assignment.role_id
     WHERE legacy_assignment.user_id = p_user_id
       AND legacy_assignment.vendor_id IS NULL
       AND legacy_assignment.outlet_id IS NULL
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
  v_actor UUID;
  v_assignment public.staff_role_assignments%ROWTYPE;
BEGIN
  v_actor := public.require_active_global_staff_super_admin();
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

NOTIFY pgrst, 'reload schema';
