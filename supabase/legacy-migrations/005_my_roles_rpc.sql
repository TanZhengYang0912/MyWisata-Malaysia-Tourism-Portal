-- ============================================================
-- Migration 005 — Current-user role lookup RPC
--
-- Why: client and server-side queries against user_roles with RLS
-- filter `auth.uid() = user_id` were returning empty in some contexts,
-- breaking role-based login redirect. Root cause is the RLS evaluation
-- when the query joins user_roles + roles under the anon token.
--
-- Fix: a SECURITY DEFINER RPC that reads user_roles by auth.uid()
-- and returns the caller's own role names. Safe because it can only
-- ever see the current user's roles.
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_roles()
RETURNS TABLE(role_name VARCHAR)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT r.name
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_my_roles TO authenticated, anon;


-- Also expose the raw auth.uid() for debugging in dev.
CREATE OR REPLACE FUNCTION whoami()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid();
$$;

GRANT EXECUTE ON FUNCTION whoami TO authenticated, anon;
