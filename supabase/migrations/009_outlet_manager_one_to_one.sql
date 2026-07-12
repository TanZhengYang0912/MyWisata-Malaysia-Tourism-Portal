-- Outlet ownership rules: one manager owns one outlet, and one outlet has one manager.
-- The relationship remains in a join table so reassignment is auditable and reversible.

-- Older mock data stored the same Outlet Manager in multiple scoped user_roles rows.
-- Keep the earliest assignment before adding the one-account/one-outlet constraint.
WITH ranked_manager_roles AS (
  SELECT ur.id,
         row_number() OVER (PARTITION BY ur.user_id, ur.role_id ORDER BY ur.created_at, ur.id) AS row_number
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE r.name = 'outlet_manager' AND ur.outlet_id IS NOT NULL
)
DELETE FROM public.user_roles ur
USING ranked_manager_roles duplicate
WHERE ur.id = duplicate.id AND duplicate.row_number > 1;

WITH ranked_assignments AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id ORDER BY created_at, id) AS row_number
  FROM public.outlet_managers
)
DELETE FROM public.outlet_managers om
USING ranked_assignments duplicate
WHERE om.id = duplicate.id AND duplicate.row_number > 1;

WITH ranked_outlet_assignments AS (
  SELECT id,
         row_number() OVER (PARTITION BY outlet_id ORDER BY created_at, id) AS row_number
  FROM public.outlet_managers
)
DELETE FROM public.outlet_managers om
USING ranked_outlet_assignments duplicate
WHERE om.id = duplicate.id AND duplicate.row_number > 1;

INSERT INTO public.outlet_managers (user_id, outlet_id)
SELECT ur.user_id, ur.outlet_id
FROM public.user_roles ur
JOIN public.roles r ON r.id = ur.role_id
WHERE r.name = 'outlet_manager' AND ur.outlet_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.outlet_managers om WHERE om.user_id = ur.user_id OR om.outlet_id = ur.outlet_id);

CREATE UNIQUE INDEX IF NOT EXISTS outlet_managers_one_manager_per_outlet
  ON public.outlet_managers (outlet_id);

CREATE UNIQUE INDEX IF NOT EXISTS outlet_managers_one_outlet_per_manager
  ON public.outlet_managers (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_outlet_manager_assignment
  ON public.user_roles (user_id, role_id)
  WHERE outlet_id IS NOT NULL;
