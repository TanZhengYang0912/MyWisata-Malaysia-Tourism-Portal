// General platform administration. Wallet Approver authority is checked
// separately by withdrawal routes and must not grant cross-domain access.

import type { SupabaseClient } from '@supabase/supabase-js';

type RoleRow = { roles: { name: string } | { name: string }[] | null };

export async function isSuperAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('user_roles').select('roles(name)').eq('user_id', userId);
  if (error) return false;
  const roleNames = ((data ?? []) as RoleRow[]).map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name;
  });
  return roleNames.includes('super_admin');
}
