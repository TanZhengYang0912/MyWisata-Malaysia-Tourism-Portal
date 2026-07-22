// P4 — Member 4: ticket escalation + the customer's own ticket list
// POST /api/support/tickets — body { sessionKey?, subject, body }. See
// CLAUDE.md Step 8.
// GET  /api/support/tickets — "My Tickets" list (CLAUDE-FIXES.md Fix 2).
//
// support_tickets has real RLS policies (support_own_or_admin SELECT,
// support_insert_own INSERT WITH CHECK user_id = auth.uid() OR NULL —
// 007_public_read_policies.sql), and chatbot_sessions' SELECT policy
// (user_id = auth.uid() OR user_id IS NULL) covers reading a session back
// to link session_id — so unlike Step 7, this route needs no service-role
// client. Guest ticket submission is intentionally allowed by the schema
// (user_id nullable, RLS explicitly permits NULL), so this doesn't require
// login the way affiliate link creation does. GET, unlike POST, DOES
// require login — a guest has no stable identity across requests to list
// tickets "by".

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { supportTicketSchema } from '@/lib/validation/chatbot-schemas';
import { classifyTicketSmart } from '@/lib/chatbot/classify-ai';
import { getLatestReplyTimestamps, isUnread } from '@/lib/support/unread';
import { cleanUserContent } from '@/lib/moderation/clean';
import { logModerationFlag } from '@/lib/moderation/flags';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, subject, category, status, withdrawal_id, created_at, last_reply_at, customer_last_read_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return apiFail('DB_ERROR', error.message, 500);

  const rows = data ?? [];
  // support_ticket_replies' own RLS (own-ticket-or-admin) already scopes
  // this correctly under the cookie-aware client — every row here is one of
  // MY tickets, so no service-role client needed.
  const latestAdminReplies = await getLatestReplyTimestamps(supabase, rows.map((t) => t.id), 'admin');

  return apiOk(
    rows.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      withdrawalId: t.withdrawal_id,
      createdAt: t.created_at,
      lastActivityAt: t.last_reply_at ?? t.created_at,
      unread: isUnread(t.customer_last_read_at, latestAdminReplies.get(t.id)),
    })),
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const parsed = await parseBody(request, supportTicketSchema);
  if (!parsed.ok) return parsed.response;
  const { sessionKey, withdrawalId, subject, body } = parsed.data;

  if (withdrawalId) {
    if (!user) return apiFail('UNAUTHORIZED', 'Sign in to link a withdrawal to a support ticket', 401);
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawal_requests')
      .select('id, user_id, status')
      .eq('id', withdrawalId)
      .maybeSingle();
    if (withdrawalError) return apiFail('DB_ERROR', withdrawalError.message, 500);
    if (!withdrawal || withdrawal.user_id !== user.id) return apiFail('FORBIDDEN', 'This withdrawal is not yours', 403);
    if (withdrawal.status !== 'hold') return apiFail('INVALID_STATE', 'Only a held withdrawal can be linked to this support ticket', 409);
  }

  let sessionId: string | null = null;
  if (sessionKey) {
    const { data: session } = await supabase
      .from('chatbot_sessions')
      .select('id')
      .eq('session_key', sessionKey)
      .maybeSingle();
    sessionId = session?.id ?? null;
  }

  // CLAUDE-MODERATION.md: mask, never block — a ticket is often filed by an
  // upset user, and this is exactly the input that must never be rejected
  // for content. Classification runs on the cleaned (masked) text too, so a
  // masked swear word doesn't skew category detection any differently than
  // the real one would have.
  const cleanedSubject = cleanUserContent(subject);
  const cleanedBody = cleanUserContent(body);

  // AI classification (Gemini) with the keyword classifier as a safety net —
  // CLAUDE-FIXES-2.md item 6. classifyTicketSmart() never throws: no
  // LLM_API_KEY, an API error/timeout, or a reply outside the six valid
  // categories all fall through to the keyword version automatically.
  const { category, method } = await classifyTicketSmart(cleanedSubject.display, cleanedBody.display);

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: user?.id ?? null,
      session_id: sessionId,
      withdrawal_id: withdrawalId ?? null,
      subject: cleanedSubject.display,
      body: cleanedBody.display,
      category,
      classification_method: method,
      status: 'open',
    })
    .select('id')
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);

  if (cleanedSubject.hadSlur || cleanedBody.hadSlur) {
    const service = createServiceClient();
    await logModerationFlag(service, {
      sourceType: 'ticket',
      sourceId: data.id,
      userId: user?.id ?? null,
      originalExcerpt: cleanedSubject.hadSlur ? cleanedSubject.original : cleanedBody.original,
    });
  }

  return apiOk({ id: data.id, category }, { status: 201 });
}
