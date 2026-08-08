import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: isSuperAdmin, error: roleError } = await supabase.rpc('is_super_admin', { uid: user.id });
  if (roleError || isSuperAdmin !== true) {
    return apiFail('FORBIDDEN', 'Super Admin access required', 403);
  }

  const { data: count, error } = await supabase.rpc('get_my_unread_recommendation_count');
  if (error) return apiFail('DB_ERROR', 'Unable to load recommendation unread state', 500);

  return apiOk({ count: typeof count === 'number' ? count : 0 });
}
