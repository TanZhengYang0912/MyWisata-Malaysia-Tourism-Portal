import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';

interface Props {
  params: Promise<{ reportId: string }>;
}

const RESOLUTION_REASONS = new Set(['action_taken', 'no_violation', 'insufficient_evidence', 'spam_abuse']);

export async function PATCH(request: Request, { params }: Props) {
  const { reportId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: isAdmin, error: roleError } = await supabase.rpc('is_super_admin', { uid: user.id });
  if (roleError || isAdmin !== true) return apiFail('FORBIDDEN', 'Admin role required', 403);

  let body: { status?: string; resolution_reason?: string; resolution_note?: string } = {};
  try { body = await request.json(); } catch { return apiFail('INVALID_BODY', 'status and resolution_reason are required', 400); }
  if (body.status !== 'resolved' && body.status !== 'dismissed') {
    return apiFail('INVALID_BODY', 'status must be resolved or dismissed', 422);
  }
  if (!body.resolution_reason || !RESOLUTION_REASONS.has(body.resolution_reason)) {
    return apiFail('INVALID_RESOLUTION_REASON', 'resolution_reason must be one of action_taken, no_violation, insufficient_evidence, spam_abuse', 422);
  }

  const { data, error } = await supabase
    .from('chat_reports')
    .update({
      status: body.status,
      resolution_reason: body.resolution_reason,
      resolution_note: body.resolution_note?.trim() || null,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select('id,status,resolution_reason,resolution_note,resolved_at')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk(data);
}
