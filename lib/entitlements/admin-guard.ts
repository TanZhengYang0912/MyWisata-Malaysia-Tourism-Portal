import "server-only";
import { requireStaffAssurance } from '@/lib/auth/staff-assurance';

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

  const assuranceResponse = await requireStaffAssurance(db);
  if (assuranceResponse) return { db, user, response: assuranceResponse };
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

  try {
    const { data: profile, error: profileError } = await db
      .from("users")
      .select("id,status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return {
        db,
        user,
        response: apiFail("AUTHORIZATION_UNAVAILABLE", "Unable to verify Access Control authority", 503),
      };
    }
    if (!profile || profile.status !== "active") {
      return {
        db,
        user,
        response: apiFail("FORBIDDEN", "Active global Super Admin access required", 403),
      };
    }

    const { data: globalRole, error: globalRoleError } = await db
      .from("user_roles")
      .select("role_id,vendor_id,outlet_id,roles!inner(name)")
      .eq("user_id", user.id)
      .eq("roles.name", "super_admin")
      .is("vendor_id", null)
      .is("outlet_id", null)
      .maybeSingle();

    if (globalRoleError) {
      return {
        db,
        user,
        response: apiFail("AUTHORIZATION_UNAVAILABLE", "Unable to verify Access Control authority", 503),
      };
    }
    if (!globalRole) {
      return {
        db,
        user,
        response: apiFail("FORBIDDEN", "Active global Super Admin access required", 403),
      };
    }
  } catch {
    return {
      db,
      user,
      response: apiFail("AUTHORIZATION_UNAVAILABLE", "Unable to verify Access Control authority", 503),
    };
  }

  return { db, user, response: null };
}
