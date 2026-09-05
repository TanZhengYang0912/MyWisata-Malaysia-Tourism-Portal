import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { StaffPermissionKey } from "@/lib/staff-permissions/types";
import { createClient } from "@/lib/supabase/server";
import { apiFail } from "@/lib/validation/schemas";

type StaffPermissionResult = {
  db: SupabaseClient;
  user: User;
  response: null;
} | {
  db: SupabaseClient;
  user: User | null;
  response: Response;
};

export async function requireStaffPermission(
  permission: StaffPermissionKey,
): Promise<StaffPermissionResult> {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();

  if (authError || !user) {
    return {
      db,
      user: null,
      response: apiFail("UNAUTHORIZED", "Sign in required", 401),
    };
  }

  const { data: allowed, error: permissionError } = await db.rpc("has_staff_permission", {
    p_user_id: user.id,
    p_permission_key: permission,
  });

  if (permissionError) {
    return {
      db,
      user,
      response: apiFail(
        "AUTHORIZATION_UNAVAILABLE",
        "Unable to verify staff permission",
        503,
      ),
    };
  }

  if (allowed !== true) {
    return {
      db,
      user,
      response: apiFail("FORBIDDEN", "Staff permission required", 403),
    };
  }

  return { db, user, response: null };
}
