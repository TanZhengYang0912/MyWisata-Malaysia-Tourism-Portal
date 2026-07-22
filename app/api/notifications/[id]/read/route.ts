import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { error } = await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id, read: true });
}
