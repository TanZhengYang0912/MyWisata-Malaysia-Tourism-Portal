// P4 — Member 4: admin chatbot. CLAUDE-ADMIN-AI.md Part 2, Capability 1.
// POST /api/admin-ai/ask — body { sessionKey?, question }. Gated on
// super_admin, checked server-side. Reuses chatbot_sessions/chatbot_messages
// with channel='admin' (migration 034) rather than a separate table.
//
// Requires migration 034_admin_ai.sql applied (chatbot_sessions.channel,
// chatbot_messages.pii_detected) — this route's inserts will fail with a
// missing-column error until that migration has been run.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail, parseBody } from '@/lib/validation/schemas';
import { adminAiAskSchema } from '@/lib/validation/admin-ai-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { answerAdminQuestion } from '@/lib/admin-ai/orchestrate';
import { cleanUserContent } from '@/lib/moderation/clean';
import { logModerationFlag } from '@/lib/moderation/flags';

export async function POST(request: Request) {
  const parsed = await parseBody(request, adminAiAskSchema);
  if (!parsed.ok) return parsed.response;
  const { sessionKey, question } = parsed.data;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(authClient, user.id))) {
    return apiFail('FORBIDDEN', 'Admin AI is limited to super admins', 403);
  }

  const service = createServiceClient();

  let session: { id: string; session_key: string } | null = null;
  if (sessionKey) {
    const { data } = await service
      .from('chatbot_sessions')
      .select('id, session_key')
      .eq('session_key', sessionKey)
      .eq('channel', 'admin')
      .maybeSingle();
    session = data ?? null;
  }
  if (!session) {
    const { data: created, error: createErr } = await service
      .from('chatbot_sessions')
      .insert({ user_id: user.id, session_key: sessionKey ?? crypto.randomUUID(), channel: 'admin' })
      .select('id, session_key')
      .single();
    if (createErr) return apiFail('DB_ERROR', createErr.message, 500);
    session = created;
  }

  // CLAUDE-MODERATION.md Part 3: same single entry point as the customer
  // chatbot — admins shouldn't be typing slurs into an AI either. Applied
  // before storage AND before the LLM call, same as the customer route.
  const cleaned = cleanUserContent(question);
  const userId = user.id;

  async function logUserMessage(): Promise<string | null> {
    const { data, error } = await service
      .from('chatbot_messages')
      .insert({ session_id: session!.id, role: 'user', body: cleaned.display, pii_detected: cleaned.hadPII })
      .select('id')
      .single();
    if (error) return null;
    if (cleaned.hadSlur) {
      await logModerationFlag(service, {
        sourceType: 'chatbot_message',
        sourceId: data.id,
        userId,
        originalExcerpt: cleaned.original,
      });
    }
    return data.id;
  }

  let result: Awaited<ReturnType<typeof answerAdminQuestion>>;
  try {
    result = await answerAdminQuestion(service, cleaned.display);
  } catch (error) {
    console.error('[admin-ai] ask failed', error instanceof Error ? error.message : error);
    // Log the user's message even on failure — the admin still typed it —
    // then report the assistant as unavailable, per CLAUDE-ADMIN-AI.md's
    // "no keyword fallback for this bot" instruction.
    await logUserMessage();
    return apiFail('ASSISTANT_UNAVAILABLE', 'The AI assistant is unavailable right now — try again shortly.', 503);
  }

  const userMsgId = await logUserMessage();
  if (!userMsgId) return apiFail('DB_ERROR', 'Failed to log message', 500);

  const { error: botMsgErr } = await service
    .from('chatbot_messages')
    .insert({ session_id: session.id, role: 'bot', body: result.answer, kb_matched: result.queryUsed !== null });
  if (botMsgErr) return apiFail('DB_ERROR', botMsgErr.message, 500);

  return apiOk({ sessionKey: session.session_key, answer: result.answer });
}
