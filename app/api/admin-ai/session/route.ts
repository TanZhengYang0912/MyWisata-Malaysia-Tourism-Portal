// P4 — Member 4: admin chatbot session history. CLAUDE-ADMIN-AI-EXPAND.md Fix 4.
// GET /api/admin-ai/session?sessionKey=... — replays a past admin AI
// conversation so returning to /admin/ai-assistant can restore it. Gated on
// super_admin, and scoped to the CURRENT admin's own session — a sessionKey
// belonging to a different admin (or a customer-channel session reusing the
// same key namespace) returns 404, never someone else's conversation.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Admin AI is limited to super admins', 403);
  }

  const sessionKey = new URL(request.url).searchParams.get('sessionKey');
  if (!sessionKey) return apiFail('BAD_REQUEST', 'sessionKey is required', 400);

  const service = createServiceClient();
  const { data: session } = await service
    .from('chatbot_sessions')
    .select('id')
    .eq('session_key', sessionKey)
    .eq('channel', 'admin')
    .eq('user_id', user.id)
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
