// P4 — Member 4: staff conduct flag transcript. CLAUDE-ADMIN-CONDUCT.md.
// GET /api/admin/conduct-flags/[id]/transcript — the full admin-ai session a
// flagged message came from, for the "View log" action. Super-admin only.
//
// Deliberately NOT the same as GET /api/admin-ai/session?sessionKey=, which
// is scoped to the CALLER's own sessions (.eq('user_id', user.id)) — correct
// for that route's own use case (AskPanel restoring its own history), wrong
// here: the reviewer is auditing a DIFFERENT admin's session, so this route
// looks the session up by source_ref_id alone, no owner filter.
//
// ticket_reply-sourced flags don't need this route — the panel links
// straight to /admin/support?ticket=<sourceRefId>, which already exists.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Staff conduct review is limited to super admins', 403);
  }

  const service = createServiceClient();
  const { data: flag } = await service
    .from('admin_conduct_flags')
    .select('source, source_ref_id')
    .eq('id', id)
    .maybeSingle();
  if (!flag) return apiFail('NOT_FOUND', 'Conduct flag not found', 404);
  if (flag.source !== 'admin_ai') {
    return apiFail('VALIDATION_FAILED', 'This flag has no admin-ai transcript', 400);
  }

  const { data: session } = await service
    .from('chatbot_sessions')
    .select('id')
    .eq('session_key', flag.source_ref_id)
    .eq('channel', 'admin')
    .maybeSingle();
  if (!session) return apiOk({ messages: [] });

  const { data: messages, error } = await service
    .from('chatbot_messages')
    .select('role, body, created_at')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true });
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk({ messages: (messages ?? []).map((m) => ({ role: m.role, text: m.body })) });
}
