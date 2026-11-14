// P4 — Member 4: AI-drafted KB entries (CLAUDE-P4-EXTRAS-2.md Extra 5)
// POST /api/admin/chatbot/kb/draft — body { question }. Returns a draft
// { title, body, keywords, category } for the admin's existing KB form to
// prefill; never saves anything itself (see lib/chatbot/kb-draft.ts's
// header). Gated on super_admin, same as every other
// /admin/chatbot route.
//
// category is classifyTicket(question) — the EXACT same keyword classifier
// support tickets already use (lib/chatbot/classify.ts), reused as-is, not
// a second classifier built for KB docs. It's a pre-fill, not a decision:
// the admin form's category dropdown lets it be overridden before saving,
// same as the support ticket page already treats its own classification as
// "a helper, not an authority."

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { draftKbEntrySchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { draftKbEntry } from '@/lib/chatbot/kb-draft';
import { answerQuestion as matchKeyword, type KbDoc } from '@/lib/chatbot/match';
import { classifyTicket } from '@/lib/chatbot/classify';
import { prepareExternalText } from '@/lib/chatbot/pii';
import { reserveAiQuota } from '@/lib/rate-limit/ai';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can draft KB entries', 403);
  }

  const parsed = await parseBody(request, draftKbEntrySchema);
  if (!parsed.ok) return parsed.response;
  const { question } = parsed.data;
  const { operationId } = parsed.data;

  const service = createServiceClient();

  // Cheap "what does the bot currently say" context — the same synchronous
  // keyword matcher the live bot itself falls back to (lib/chatbot/match.ts),
  // not a second live Gemini call. For a fully-unanswered question this
  // finds nothing (existingWeakAnswer stays null, matching draftKbEntry()'s
  // "no answer at all" framing); for an answered-but-unhelpful question it
  // very likely finds the same doc the RAG path also matched, since
  // FAQ-style keyword overlap and semantic similarity usually agree — good
  // enough context for the model to improve on, without doubling the
  // request's Gemini cost/latency.
  const { data: kbRows, error: kbRowsError } = await service
    .from('chatbot_kb_documents')
    .select('id, title, body, keywords, category, content_version')
    .eq('is_active', true);
  if (kbRowsError) return apiFail('READ_UNAVAILABLE', 'Unable to check existing knowledge-base content.', 503);
  const docs: KbDoc[] = (kbRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    keywords: row.keywords ?? [],
    category: row.category,
  }));
  const existingMatch = matchKeyword(question, docs);
  const privacyCheck = prepareExternalText(`QUESTION: ${question}${existingMatch?.body ? `\nEXISTING ANSWER: ${existingMatch.body}` : ''}`);
  if (!privacyCheck.allowed) {
    return apiFail('PERSONAL_DATA_WITHHELD', 'The draft request was not sent to AI because it may contain personal details. Remove phone, email, identity, bank, or private-address details, or write the knowledge-base entry manually.', 422);
  }
  const normalizedExistingAnswer = existingMatch ? prepareExternalText(existingMatch.body) : null;
  if (normalizedExistingAnswer && !normalizedExistingAnswer.allowed) {
    return apiFail('PERSONAL_DATA_WITHHELD', 'The draft request was not sent to AI because the matching knowledge-base content contains personal details. Review the source entry or write the draft manually.', 422);
  }

  const normalizedContext = {
    question: privacyCheck.clean,
    matchedDocumentId: existingMatch?.id ?? null,
    matchedDocumentVersion: kbRows?.find((row) => row.id === existingMatch?.id)?.content_version ?? null,
    existingAnswer: normalizedExistingAnswer?.allowed ? normalizedExistingAnswer.clean : null,
  };
  const payloadHash = createHash('sha256').update(JSON.stringify(normalizedContext)).digest('hex');
  const actorKey = `user:${user.id}`;
  const { data: reservation, error: reservationError } = await service.rpc('reserve_support_kb_draft', {
    p_operation_id: operationId,
    p_owner_user_id: user.id,
    p_payload_hash: payloadHash,
  });
  if (reservationError) {
    return reservationError.code === '23505'
      ? apiFail('OPERATION_CONFLICT', 'This draft request key was already used for another question. Retry the draft action.', 409)
      : apiFail('READ_UNAVAILABLE', 'Unable to check the previous draft request.', 503);
  }
  const operation = reservation as { state?: string; shouldExecute?: boolean; leaseToken?: string; errorCode?: string } | null;
  if (!operation) return apiFail('READ_UNAVAILABLE', 'Unable to check the previous draft request.', 503);

  if (operation.state === 'completed') {
    const { data: savedResult, error: savedResultError } = await service.from('support_operations')
      .select('result_json, result_expires_at')
      .eq('id', operationId)
      .eq('owner_user_id', user.id)
      .eq('actor_key', actorKey)
      .eq('kind', 'kb_draft')
      .maybeSingle();
    if (savedResultError) return apiFail('READ_UNAVAILABLE', 'Unable to load the saved draft result.', 503);
    const result = kbDraftResultSchema.safeParse(savedResult?.result_json);
    if (!result.success || !savedResult?.result_expires_at || new Date(savedResult.result_expires_at).getTime() <= Date.now()) {
      return apiFail('DRAFT_RESULT_EXPIRED', 'The previous draft result expired. Select AI Draft again to start a new request, or write the entry manually.', 409);
    }
    return apiOk(result.data);
  }
  if (operation.state === 'failed') {
    if (operation.errorCode === 'RATE_LIMITED') return apiFail('RATE_LIMITED', 'AI drafting is temporarily unavailable. You can still write and save the entry manually.', 429);
    return apiFail('DRAFT_UNAVAILABLE', 'Could not draft a KB entry right now — try again, or write one manually.', 502);
  }
  if (operation.state !== 'running' || operation.shouldExecute !== true || !operation.leaseToken) {
    return apiFail('OPERATION_UNKNOWN', 'This draft request is already running or its result is not confirmed. Check the saved draft result before starting another request.', 409);
  }

  if (!(await reserveAiQuota(request, 'kb_draft', user.id))) {
    await service.rpc('finish_support_kb_draft_failure', {
      p_operation_id: operationId,
      p_owner_user_id: user.id,
      p_lease_token: operation.leaseToken,
      p_safe_code: 'RATE_LIMITED',
    });
    return apiFail('RATE_LIMITED', 'AI drafting is temporarily unavailable. You can still write and save the entry manually.', 429);
  }

  let externalStarted = false;
  const draft = await draftKbEntry(question, existingMatch?.body ?? null, async () => {
    const { data, error } = await service.rpc('mark_support_operation_external_started', {
      p_operation_id: operationId,
      p_actor_key: actorKey,
      p_lease_token: operation.leaseToken,
    });
    if (error || data !== true) throw new Error('support_operation_lease_lost');
    externalStarted = true;
  });
  if (!draft) {
    await service.rpc('finish_support_kb_draft_failure', {
      p_operation_id: operationId,
      p_owner_user_id: user.id,
      p_lease_token: operation.leaseToken,
      p_safe_code: 'DRAFT_UNAVAILABLE',
    });
    return externalStarted
      ? apiFail('OPERATION_UNKNOWN', 'Gemini may have received this request, but its result could not be confirmed. Do not retry this operation; review the question or write the entry manually.', 409)
      : apiFail('DRAFT_UNAVAILABLE', 'Could not draft a KB entry right now — try again, or write one manually.', 502);
  }

  const result = kbDraftResultSchema.safeParse({ ...draft, category: classifyTicket(question) });
  if (!result.success) {
    await service.rpc('finish_support_kb_draft_failure', {
      p_operation_id: operationId,
      p_owner_user_id: user.id,
      p_lease_token: operation.leaseToken,
      p_safe_code: 'DRAFT_UNAVAILABLE',
    });
    return externalStarted
      ? apiFail('OPERATION_UNKNOWN', 'Gemini may have received this request, but the draft could not be safely confirmed. Write the entry manually.', 409)
      : apiFail('DRAFT_UNAVAILABLE', 'Could not draft a KB entry right now — try again, or write one manually.', 502);
  }
  const { data: completed, error: completionError } = await service.rpc('complete_support_kb_draft', {
    p_operation_id: operationId,
    p_owner_user_id: user.id,
    p_lease_token: operation.leaseToken,
    p_payload_hash: payloadHash,
    p_result: result.data,
  });
  const completedResult = kbDraftResultSchema.safeParse(completed);
  if (completionError || !completedResult.success) {
    return apiFail('OPERATION_UNKNOWN', 'The draft could not be confirmed as saved. Check the saved draft result before starting another request.', 409);
  }
  return apiOk(completedResult.data);
}

const kbDraftResultSchema = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(2000),
  keywords: z.array(z.string().trim().min(1).max(64)).max(8),
  category: z.enum(['booking', 'payment', 'vendor', 'withdrawal', 'affiliate', 'general']),
}).strict();
