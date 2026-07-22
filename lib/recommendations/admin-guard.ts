import type { SupabaseClient } from '@supabase/supabase-js';

type RoleRow = { roles: { name: string } | { name: string }[] | null };

/** Recommendation reward operations are platform administration, not an
 * approver workflow. Keep this guard separate from Affiliate's approver guard. */
export async function isRecommendationRewardAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', userId);
  if (error) return false;

  return ((data ?? []) as RoleRow[]).some((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name === 'admin' || role?.name === 'super_admin';
  });
}
