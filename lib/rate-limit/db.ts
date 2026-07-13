import type { SupabaseClient } from '@supabase/supabase-js';

export async function checkDailyLimit(
  service: SupabaseClient,
  table: string,
  userColumn: string,
  userId: string,
  maxPerDay: number,
): Promise<boolean> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await service
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(userColumn, userId)
    .gte('created_at', since);
  return (count ?? 0) < maxPerDay;
}
