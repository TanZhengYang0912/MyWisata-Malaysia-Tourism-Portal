// P4 — Member 4: shared admin role check for this module's admin routes.
// Same check already used in app/api/admin/vendors/[id]/approve/route.ts —
// not extracted repo-wide (that file isn't mine to refactor), just reused
// here so this module's own admin routes (Step 9) don't drift from each
// other. Must be checked server-side in every route that uses it, per
// CLAUDE.md Step 9 ("check server-side in the API route too, not just the UI").

import type { SupabaseClient } from '@supabase/supabase-js';

type RoleRow = { roles: { name: string } | { name: string }[] | null };

export async function isSuperAdminOrApprover(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from('user_roles').select('roles(name)').eq('user_id', userId);
  const roleNames = ((data ?? []) as RoleRow[]).map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name;
  });
  return roleNames.includes('super_admin') || roleNames.includes('approver');
}
