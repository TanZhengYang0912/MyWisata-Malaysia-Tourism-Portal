-- Provide a least-privilege Sponsored Placements role template without
-- changing the existing permission boundary or assigning it to any employee.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.staff_roles
     WHERE name = 'Sponsored Placement Manager'
       AND is_system IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'sponsored_placement_manager_role_name_conflict';
  END IF;
END
$$;

INSERT INTO public.staff_roles (
  name,
  description,
  is_system,
  is_active,
  created_by
)
VALUES (
  'Sponsored Placement Manager',
  'Template for staff who manage Sponsored Placements',
  TRUE,
  TRUE,
  NULL
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_system = TRUE,
  is_active = TRUE,
  updated_at = now();

-- Re-running this migration must restore the exact least-privilege template,
-- even if a partially configured copy already exists under the reserved name.
DELETE FROM public.staff_role_permissions AS role_permission
 USING public.staff_roles AS staff_role,
       public.staff_permissions AS permission
 WHERE role_permission.role_id = staff_role.id
   AND role_permission.permission_id = permission.id
   AND staff_role.name = 'Sponsored Placement Manager'
   AND staff_role.is_system IS TRUE
   AND permission.key <> 'admin.map_campaign.manage';

INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT staff_role.id, permission.id
  FROM public.staff_roles AS staff_role
  JOIN public.staff_permissions AS permission
    ON permission.key = 'admin.map_campaign.manage'
 WHERE staff_role.name = 'Sponsored Placement Manager'
   AND staff_role.is_system IS TRUE
ON CONFLICT (role_id, permission_id) DO NOTHING;
