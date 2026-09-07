import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
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

export async function requireStaffRoleManagementSuperAdmin(): Promise<StaffPermissionResult> {
  const base = await requireAccessControlSuperAdmin();
  if (base.response || !base.user) return base;

  try {
    const { data: profile, error: profileError } = await base.db
      .from("users")
      .select("id,status")
      .eq("id", base.user.id)
      .maybeSingle();

    if (profileError) {
      return {
        db: base.db,
        user: base.user,
        response: apiFail(
          "AUTHORIZATION_UNAVAILABLE",
          "Unable to verify staff governance authority",
          503,
        ),
      };
    }

    if (!profile || profile.status !== "active") {
      return {
        db: base.db,
        user: base.user,
        response: apiFail("FORBIDDEN", "Active global Super Admin access required", 403),
      };
    }

    const { data: globalRole, error: roleError } = await base.db
      .from("user_roles")
      .select("role_id,vendor_id,outlet_id,roles!inner(name)")
      .eq("user_id", base.user.id)
      .eq("roles.name", "super_admin")
      .is("vendor_id", null)
      .is("outlet_id", null)
      .maybeSingle();

    if (roleError) {
      return {
        db: base.db,
        user: base.user,
        response: apiFail(
          "AUTHORIZATION_UNAVAILABLE",
          "Unable to verify staff governance authority",
          503,
        ),
      };
    }

    if (!globalRole) {
      return {
        db: base.db,
        user: base.user,
        response: apiFail("FORBIDDEN", "Active global Super Admin access required", 403),
      };
    }

    return { db: base.db, user: base.user, response: null };
  } catch {
    return {
      db: base.db,
      user: base.user,
      response: apiFail(
        "AUTHORIZATION_UNAVAILABLE",
        "Unable to verify staff governance authority",
        503,
      ),
    };
  }
}
