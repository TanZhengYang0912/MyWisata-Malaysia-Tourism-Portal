import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { getChatArchiveDays } from '@/lib/chat/settings';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
  if (!isAdmin) return apiFail('FORBIDDEN', 'Admin role required', 403);

  const archiveDays = await getChatArchiveDays(supabase);
  return apiOk({ archiveDays });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { uid: user.id });
  if (!isSuperAdmin) return apiFail('FORBIDDEN', 'Super admin role required', 403);

  let body: { archiveDays?: number } = {};
  try { body = await request.json(); } catch { return apiFail('INVALID_BODY', 'archiveDays is required', 400); }
  const archiveDays = Number(body.archiveDays);
  if (!Number.isFinite(archiveDays) || archiveDays < 1 || archiveDays > 3650) {
    return apiFail('INVALID_BODY', 'archiveDays must be between 1 and 3650', 400);
  }

  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key: 'chat.archive_days', value: String(Math.round(archiveDays)), description: 'Days of inactivity before an open chat thread is auto-archived', updated_by: user.id }, { onConflict: 'key' });
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ archiveDays: Math.round(archiveDays) });
}
