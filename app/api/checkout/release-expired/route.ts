import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`) {
    const service = createServiceClient();
    const { data, error } = await service.rpc('expire_checkout_sessions');
    if (error) return apiFail('DB_ERROR', error.message, 500);
    return apiOk({ expired: data ?? 0 });
  }
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: isAdmin } = await db.rpc('is_admin', { uid: user.id });
  if (!isAdmin) return apiFail('FORBIDDEN', 'Admin role required', 403);
  const service = createServiceClient();
  const { data, error } = await service.rpc('expire_checkout_sessions');
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ expired: data ?? 0 });
}
