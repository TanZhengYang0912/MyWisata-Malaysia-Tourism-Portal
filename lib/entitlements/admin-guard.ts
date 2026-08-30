import "server-only";

import { createClient } from "@/lib/supabase/server";
import { apiFail } from "@/lib/validation/schemas";

export async function requireAccessControlSuperAdmin() {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();

  if (authError || !user) {
    return {
      db,
      user: null,
      response: apiFail("UNAUTHORIZED", "Sign in required", 401),
    };
  }

  const { data: isSuperAdmin, error: roleError } = await db.rpc("is_super_admin", { uid: user.id });
  if (roleError) {
    return {
      db,
      user,
      response: apiFail("AUTHORIZATION_UNAVAILABLE", "Unable to verify Access Control authority", 503),
    };
  }
  if (isSuperAdmin !== true) {
    return {
      db,
      user,
      response: apiFail("FORBIDDEN", "Super Admin access required", 403),
    };
  }

  return { db, user, response: null };
}
