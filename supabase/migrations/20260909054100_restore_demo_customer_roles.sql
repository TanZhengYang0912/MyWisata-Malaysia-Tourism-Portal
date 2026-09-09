-- Restore canonical customer-role assignments for the fixed demo identities.
--
-- The remote demo seed historically created these Auth/profile records without
-- including Customer in its role-assignment phase.
-- Match both UUID and email so this repair can never grant a role to a real user.

INSERT INTO public.user_roles (user_id, role_id, vendor_id, outlet_id)
SELECT
  user_row.id,
  role_row.id,
  NULL,
  NULL
FROM (
  VALUES
    ('aaaaaaaa-0000-0000-0000-000000000005'::UUID, 'customer1@demo.local'::TEXT),
    ('aaaaaaaa-0000-0000-0000-000000000006'::UUID, 'customer2@demo.local'::TEXT),
    ('aaaaaaaa-0000-0000-0000-000000000007'::UUID, 'customer3@demo.local'::TEXT),
    ('aaaaaaaa-0000-0000-0000-000000000008'::UUID, 'customer4@demo.local'::TEXT)
) AS expected_user(id, email)
JOIN public.users AS user_row
  ON user_row.id = expected_user.id
 AND LOWER(user_row.email) = expected_user.email
JOIN public.roles AS role_row
  ON role_row.name = 'customer'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles AS existing_assignment
  WHERE existing_assignment.user_id = user_row.id
    AND existing_assignment.role_id = role_row.id
    AND existing_assignment.vendor_id IS NULL
    AND existing_assignment.outlet_id IS NULL
)
ON CONFLICT DO NOTHING;
