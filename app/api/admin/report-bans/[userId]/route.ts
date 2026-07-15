import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';

interface Props {
  params: Promise<{ userId: string }>;
}

const ALLOWED_DAYS = new Set([7, 30]);

export async function POST(request: Request, { params }: Props) {
  const { userId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
  if (!isAdmin) return apiFail('FORBIDDEN', 'Admin role required', 403);

  let body: { days?: number; reason?: string } = {};
  try { body = await request.json(); } catch { return apiFail('INVALID_BODY', 'days is required', 400); }
  if (!body.days || !ALLOWED_DAYS.has(body.days)) {
    return apiFail('INVALID_BODY', 'days must be 7 or 30', 422);
  }

  const bannedUntil = new Date(Date.now() + body.days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('chat_report_bans')
    .insert({ user_id: userId, banned_until: bannedUntil, reason: body.reason?.trim() || null, banned_by: user.id })
    .select('id,banned_until')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk(data, { status: 201 });
}

export async function DELETE(_request: Request, { params }: Props) {
  const { userId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
  if (!isAdmin) return apiFail('FORBIDDEN', 'Admin role required', 403);

  // Lifts every currently-active ban for this user rather than one row —
  // an admin who mis-blocked shouldn't have to know how many ban rows exist.
  const { error } = await supabase
    .from('chat_report_bans')
    .delete()
    .eq('user_id', userId)
    .gt('banned_until', new Date().toISOString());
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk({ userId });
}
