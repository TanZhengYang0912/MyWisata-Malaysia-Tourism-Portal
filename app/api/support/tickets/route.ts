// P4 — Member 4: ticket escalation + the customer's own ticket list
// POST /api/support/tickets — body { sessionKey?, subject, body }. See
// CLAUDE.md Step 8.
// GET  /api/support/tickets — "My Tickets" list (CLAUDE-FIXES.md Fix 2).
//
// Ticket creation uses the service client after checking the caller's ownership.
// Guests may submit unlinked tickets. Listing and chat handoffs require sign-in.

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
  const { sessionKey, withdrawalId, orderId, messageId, subject, body } = parsed.data;
  const supportService = createServiceClient();

  let verifiedOrderReference: string | null = null;
  if (orderId) {
    if (!user) return apiFail('UNAUTHORIZED', 'Sign in to link an order to a support ticket', 401);
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, display_id')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (orderError) return apiFail('DB_ERROR', orderError.message, 503);
    if (!order) return apiFail('NOT_FOUND', 'Order not found.', 404);
    verifiedOrderReference = order.display_id || order.id.slice(0, 8).toUpperCase();
  }

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
    const { data: session, error: sessionError } = await supportService
      .from('chatbot_sessions')
      .select('id,user_id,session_key')
      .eq('session_key', sessionKey)
      .maybeSingle();
    if (sessionError) return apiFail('DB_ERROR', 'Unable to verify the chat session.', 503);
    if (!session) return apiFail('SESSION_NOT_FOUND', 'Chat session not found. Start a new conversation and try again.', 404);
    if (session.user_id !== (user?.id ?? null)) return apiFail('FORBIDDEN', 'This chat session does not belong to you.', 403);
    sessionId = session?.id ?? null;
  }

  if (messageId) {
    if (!user) return apiFail('UNAUTHORIZED', 'Sign in before opening a support ticket.', 401);
    if (!sessionId) return apiFail('INVALID_SESSION', 'Start a support conversation before opening a ticket.', 400);
    const { data: message, error: messageError } = await supportService
      .from('chatbot_messages')
      .select('id, role')
      .eq('id', messageId)
      .eq('session_id', sessionId)
      .maybeSingle();
    if (messageError) return apiFail('DB_ERROR', 'Unable to verify the chat reply.', 503);
    if (!message || message.role !== 'bot') return apiFail('FORBIDDEN', 'This chat reply cannot open a support ticket.', 403);

    const { data: existing, error: existingError } = await supportService
      .from('support_tickets')
      .select('id, category')
      .eq('user_id', user.id)
      .eq('chatbot_message_id', messageId)
      .maybeSingle();
    if (existingError) return apiFail('DB_ERROR', 'Unable to check the existing support ticket.', 503);
    if (existing) return apiOk({ id: existing.id, category: existing.category, replayed: true });
  }

  // CLAUDE-MODERATION.md: mask, never block — a ticket is often filed by an
  // upset user, and this is exactly the input that must never be rejected
  // for content. Classification runs on the cleaned (masked) text too, so a
  // masked swear word doesn't skew category detection any differently than
  // the real one would have.
  const cleanedSubject = await cleanUserContent(subject, supportService);
  const cleanedBody = await cleanUserContent(body, supportService);
  // The account's verified order reference belongs in the ticket record only.
  const ticketBody = verifiedOrderReference
    ? `Order reference: ${verifiedOrderReference}\n\n${cleanedBody.display}`.slice(0, 2000)
    : cleanedBody.display;

  // AI classification (Gemini) with the keyword classifier as a safety net —
  // CLAUDE-FIXES-2.md item 6. classifyTicketSmart() never throws: no
  // LLM_API_KEY, an API error/timeout, or a reply outside the six valid
  // categories all fall through to the keyword version automatically.
  const { category, method } = await classifyTicketSmart(cleanedSubject.display, cleanedBody.display);

  // Signed-in and guest users can no longer insert support tickets directly
  // (live column/write lockdown). The owner comes from the session above, never
  // from the request body, so writing through the service client is safe.
  const { data, error } = await supportService
    .from('support_tickets')
    .insert({
      user_id: user?.id ?? null,
      session_id: sessionId,
      withdrawal_id: withdrawalId ?? null,
      ...(messageId ? { chatbot_message_id: messageId } : {}),
      subject: cleanedSubject.display,
      body: ticketBody,
      category,
      classification_method: method,
      status: 'open',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505' && messageId && user) {
      const { data: existing, error: existingError } = await supportService
        .from('support_tickets')
        .select('id, category')
        .eq('user_id', user.id)
        .eq('chatbot_message_id', messageId)
        .maybeSingle();
      if (!existingError && existing) return apiOk({ id: existing.id, category: existing.category, replayed: true });
    }
    return apiFail('DB_ERROR', error.message, 500);
  }

  if (cleanedSubject.hadSlur || cleanedBody.hadSlur) {
    await logModerationFlag(supportService, {
      sourceType: 'ticket',
      sourceId: data.id,
      userId: user?.id ?? null,
      originalExcerpt: cleanedSubject.hadSlur ? cleanedSubject.original : cleanedBody.original,
    });
  }

  return apiOk({ id: data.id, category }, { status: 201 });
}
