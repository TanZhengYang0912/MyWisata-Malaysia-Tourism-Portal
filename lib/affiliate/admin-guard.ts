// General platform administration. Wallet Approver authority is checked
// separately by withdrawal routes and must not grant cross-domain access.

import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaffAssurance } from '@/lib/auth/staff-assurance';

type RoleRow = { roles: { name: string } | { name: string }[] | null };

export async function isSuperAdmin(
  supabase: SupabaseClient,
  userId: string,
  options: { throwOnLookupError?: boolean } = {},
): Promise<boolean> {
  const assuranceResponse = await requireStaffAssurance(supabase);
  if (assuranceResponse) {
    if (options.throwOnLookupError && assuranceResponse.status >= 500) {
      throw new Error('super_admin_lookup_unavailable');
    }
    return false;
  }
  // A user's own super-admin power needs an authenticator-verified (aal2) session.
  // Plan: Docs/plans/2026-10-14-1543-staff-two-factor-login.md
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) {
    if (options.throwOnLookupError) throw new Error('super_admin_lookup_unavailable');
    return false;
  }
  const claims = claimsData?.claims;
  if (claims?.sub === userId && claims.aal !== 'aal2') return false;


  const { data, error } = await supabase.from('user_roles').select('roles(name)').eq('user_id', userId);
  if (error) {
    if (options.throwOnLookupError) throw new Error('super_admin_lookup_unavailable');
    return false;
  }
  const roleNames = ((data ?? []) as RoleRow[]).map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name;
  });
  return roleNames.includes('super_admin');
}
