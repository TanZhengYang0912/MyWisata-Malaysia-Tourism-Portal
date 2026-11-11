// P4 — Member 4: ticket escalation + the customer's own ticket list
// POST /api/support/tickets — body { sessionKey?, subject, body }. See
// CLAUDE.md Step 8.
// GET  /api/support/tickets — "My Tickets" list (CLAUDE-FIXES.md Fix 2).
//
// support_tickets has real RLS policies (support_own_or_admin SELECT,
// support_insert_own INSERT WITH CHECK user_id = auth.uid() OR NULL —
// 007_public_read_policies.sql). chatbot_sessions is no longer readable by
// guests (20261014120000), so linking a session reads it with the service
// client and checks ownership here. Guest ticket submission is intentionally allowed by the schema
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
import { reserveAiQuota } from '@/lib/rate-limit/ai';
import { prepareExternalText } from '@/lib/chatbot/pii';
import { verifyHandoffToken } from '@/lib/support/handoff-token';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const rawPage = new URL(request.url).searchParams.get('page') ?? '1';
  if (!/^\d+$/.test(rawPage) || Number(rawPage) < 1 || Number(rawPage) > 1_000_000) {
    return apiFail('INVALID_INPUT', 'Page must be a positive integer.', 400);
  }
  const requestedPage = Number(rawPage);
  const pageSize = 10;
  const selectFields = 'id, subject, category, status, withdrawal_id, created_at, last_reply_at, customer_last_read_at';
  const fetchPage = () => supabase
    .from('support_tickets')
    .select(selectFields, { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  let page = requestedPage;
  const initialResult = await fetchPage().range((page - 1) * pageSize, page * pageSize - 1);
  let { data, error } = initialResult;
  if (error) return apiFail('READ_UNAVAILABLE', 'Unable to load your support requests.', 503);

  const total = initialResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) {
    page = totalPages;
    ({ data, error } = await fetchPage().range((page - 1) * pageSize, page * pageSize - 1));
    if (error) return apiFail('READ_UNAVAILABLE', 'Unable to load your support requests.', 503);
  }

  const rows = data ?? [];
  // support_ticket_replies' own RLS (own-ticket-or-admin) already scopes
  // this correctly under the cookie-aware client — every row here is one of
  // MY tickets, so no service-role client needed.
  const latestAdminReplies = await getLatestReplyTimestamps(supabase, rows.map((t) => t.id), 'admin');

  const response = apiOk({
    tickets: rows.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      withdrawalId: t.withdrawal_id,
      createdAt: t.created_at,
      lastActivityAt: t.last_reply_at ?? t.created_at,
      unread: isUnread(t.customer_last_read_at, latestAdminReplies.get(t.id)),
    })),
    page,
    pageSize,
    total,
    totalPages,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in before creating a support ticket.', 401);
  const ownerUserId = user.id;

  const parsed = await parseBody(request, supportTicketSchema);
  if (!parsed.ok) return parsed.response;
  const { sessionKey, withdrawalId, subject, body, operationId, handoffToken } = parsed.data;
  if (sessionKey) {
    // Legacy requests may still carry a session key, but no Support endpoint
    // should read its transcript or attach the live session to a new ticket.
    return apiFail('UPDATE_REQUIRED', 'Refresh Support and review the handoff details before creating a ticket.', 409);
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

  // CLAUDE-MODERATION.md: mask, never block — a ticket is often filed by an
  // upset user, and this is exactly the input that must never be rejected
  // for content. Classification runs on the cleaned (masked) text too, so a
  // masked swear word doesn't skew category detection any differently than
  // the real one would have.
  const moderationService = createServiceClient();
  const cleanedSubject = await cleanUserContent(subject, moderationService);
  const cleanedBody = await cleanUserContent(body, moderationService);

  if (!withdrawalId) {
    if (!operationId || !handoffToken) {
      return apiFail('UPDATE_REQUIRED', 'Refresh Support and review the ticket details before submitting.', 409);
    }
    if (!(await verifyHandoffToken(handoffToken, ownerUserId, cleanedSubject.display, cleanedBody.display))) {
      return apiFail('HANDOFF_REVIEW_REQUIRED', 'Review the ticket details again before submitting.', 409);
    }
  }

  const operationPayloadHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({
    userId: ownerUserId,
    withdrawalId: withdrawalId ?? null,
    subject: cleanedSubject.display,
    body: cleanedBody.display,
  }))).then((digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''));

  async function findOperationResult() {
    if (!operationId) return { data: null, error: null };
    let query = moderationService.from('support_tickets')
      .select('id,category,operation_payload_hash')
      .eq('operation_id', operationId);
    query = query.eq('user_id', ownerUserId);
    return query.maybeSingle();
  }

  if (operationId) {
    const { data: existing, error: lookupError } = await findOperationResult();
    if (lookupError) return apiFail('READ_UNAVAILABLE', 'Unable to check the ticket submission result.', 503);
    if (existing) {
      if (existing.operation_payload_hash !== operationPayloadHash) {
        return apiFail('OPERATION_CONFLICT', 'This submission key was already used for different ticket details.', 409);
      }
      return apiOk({ id: existing.id, category: existing.category }, { status: 200 });
    }
  }

  // Persist the support request using the local classifier first. Gemini is
  // optional enrichment after the ticket exists, so a timeout or lost HTTP
  // response cannot cause the same user intent to invoke Gemini twice.
  const keywordClassification = await classifyTicketSmart(cleanedSubject.display, cleanedBody.display, false);

  const { data, error } = await moderationService
    .from('support_tickets')
    .insert({
      user_id: ownerUserId,
      // The ticket contains only its explicitly confirmed body. Keep no live
      // chat-session link that could expose later or unrelated conversation.
      session_id: null,
      withdrawal_id: withdrawalId ?? null,
      subject: cleanedSubject.display,
      body: cleanedBody.display,
      category: keywordClassification.category,
      classification_method: 'keyword',
      status: 'open',
      operation_id: operationId ?? null,
      operation_payload_hash: operationId ? operationPayloadHash : null,
    })
    .select('id,category')
    .single();

  if (error) {
    if (operationId && error.code === '23505') {
      const { data: existing } = await findOperationResult();
      if (existing?.operation_payload_hash === operationPayloadHash) {
        return apiOk({ id: existing.id, category: existing.category }, { status: 200 });
      }
      if (existing) return apiFail('OPERATION_CONFLICT', 'This submission key was already used for different ticket details.', 409);
    }
    return apiFail('DB_ERROR', error.message, 500);
  }

  let category = data.category;
  const allowAiClassification = prepareExternalText(`${cleanedSubject.display}\n${cleanedBody.display}`).allowed
    && await reserveAiQuota(request, 'ticket_classification', user?.id ?? null).catch(() => false);
  if (allowAiClassification) {
    const aiClassification = await classifyTicketSmart(cleanedSubject.display, cleanedBody.display, true);
    if (aiClassification.method === 'ai') {
      const { error: classificationUpdateError } = await moderationService
        .from('support_tickets')
        .update({ category: aiClassification.category, classification_method: 'ai' })
        .eq('id', data.id);
      if (!classificationUpdateError) category = aiClassification.category;
    }
  }

  if (cleanedSubject.hadSlur || cleanedBody.hadSlur) {
    await logModerationFlag(moderationService, {
      sourceType: 'ticket',
      sourceId: data.id,
      userId: user?.id ?? null,
      originalExcerpt: cleanedSubject.hadSlur ? cleanedSubject.original : cleanedBody.original,
    });
  }

  return apiOk({ id: data.id, category }, { status: 201 });
}
