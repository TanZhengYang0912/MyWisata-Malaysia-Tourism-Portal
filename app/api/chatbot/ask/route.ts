// P4 — Member 4: FAQ chatbot
// POST /api/chatbot/ask — body { sessionKey?, question }. See CLAUDE.md Step 7,
// upgraded to the RAG/LLM pipeline in CLAUDE-PHASE2.md Feature A.
//
// chatbot_sessions/chatbot_messages have RLS enabled with SELECT-only
// policies (own-or-guest) — no INSERT policy exists on either table
// (007_public_read_policies.sql), so writes need the service-role client,
// same pattern as orders/order_items (CLAUDE.md Section 2/Section 6).

import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { chatbotAskSchema } from '@/lib/validation/chatbot-schemas';
import { answerQuestion } from '@/lib/chatbot/answer';
import { cleanUserContent } from '@/lib/moderation/clean';
import { logModerationFlag } from '@/lib/moderation/flags';
import { reserveAiQuota } from '@/lib/rate-limit/ai';
import { prepareExternalText } from '@/lib/chatbot/pii';
import { bindChatbotGuestSessionToken, hashChatbotGuestCredential, readChatbotGuestCredential } from '@/lib/chatbot/guest-session';

export async function POST(request: Request) {
  const parsed = await parseBody(request, chatbotAskSchema);
  if (!parsed.ok) return parsed.response;
  const { sessionKey, operationId, question } = parsed.data;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  const guestCredential = user ? null : readChatbotGuestCredential(request);
  if (!user && !guestCredential) return apiFail('GUEST_SESSION_REQUIRED', 'Enable cookies to continue this guest chat, or sign in.', 401);
  const guestTokenHash = guestCredential ? hashChatbotGuestCredential(guestCredential) : null;
  const resolvedSessionKey = sessionKey ?? crypto.randomUUID();

  const service = createServiceClient();

  let session: { id: string; session_key: string; user_id: string | null; guest_token_hash: string | null } | null = null;
  async function guestSessionMatches(candidate: { guest_token_hash: string | null }) {
    if (user) return true;
    if (!guestTokenHash) return false;
    if (candidate.guest_token_hash === guestTokenHash) return true;
    return candidate.guest_token_hash === null && await bindChatbotGuestSessionToken(resolvedSessionKey, guestTokenHash);
  }
  if (sessionKey) {
    const { data, error } = await service
      .from('chatbot_sessions')
      .select('id, session_key, user_id, guest_token_hash')
      .eq('session_key', sessionKey)
      .maybeSingle();
    if (error) return apiFail('DB_ERROR', 'Unable to verify the chat session.', 503);
    if (data && data.user_id !== (user?.id ?? null)) {
      return apiFail('FORBIDDEN', 'This chat session does not belong to you.', 403);
    }
    if (data && !await guestSessionMatches(data)) return apiFail('FORBIDDEN', 'This chat session does not belong to you.', 403);
    session = data ?? null;
  }
  if (!session) {
    const { data: created, error: createErr } = await service
      .from('chatbot_sessions')
      .insert({ user_id: user?.id ?? null, session_key: resolvedSessionKey, guest_token_hash: guestTokenHash })
      .select('id, session_key, user_id, guest_token_hash')
      .single();
    if (createErr?.code === '23505' && sessionKey) {
      const { data: existing, error: lookupErr } = await service
        .from('chatbot_sessions')
        .select('id, session_key, user_id, guest_token_hash')
        .eq('session_key', sessionKey)
        .maybeSingle();
      if (lookupErr || !existing || existing.user_id !== (user?.id ?? null) || !await guestSessionMatches(existing)) {
        return apiFail('DB_ERROR', 'Unable to establish the chat session.', 503);
      }
      session = existing;
    } else if (createErr) {
      return apiFail('DB_ERROR', 'Unable to establish the chat session.', 503);
    }
    else session = created;
  }

  // CLAUDE-MODERATION.md Part 3: cleanUserContent() is the one entry point —
  // profanity masked, PII redacted — applied BEFORE storage and BEFORE the
  // LLM ever sees the question. Supersedes CLAUDE-ADMIN-AI.md's earlier
  // "store the original for the user's own view" design: that doc scoped
  // redaction to the Gemini call only; this one is explicit that PII must
  // stay out of storage too (Part 1's table: "Keep sensitive data OUT of
  // storage + off external APIs"). The user's own message now displays
  // masked, same as everyone else's view of it.
  const cleaned = await cleanUserContent(question, service);
  const operationPayloadHash = createHash('sha256')
    .update(JSON.stringify({ sessionId: session.id, userId: user?.id ?? null, question: cleaned.display }))
    .digest('hex');
  const actorKey = user ? `user:${user.id}` : `guest:${guestTokenHash}`;

  const findExistingAnswer = async () => {
    const { data: existingUser, error: existingUserErr } = await service
      .from('chatbot_messages')
      .select('id, operation_payload_hash')
      .eq('session_id', session.id)
      .eq('role', 'user')
      .eq('operation_id', operationId)
      .maybeSingle();
    if (existingUserErr) return { response: apiFail('DB_ERROR', 'Unable to check the previous request.', 503) };
    if (!existingUser) return { response: null, userMessageId: null as string | null };
    if (existingUser.operation_payload_hash !== operationPayloadHash) {
      return { response: apiFail('OPERATION_CONFLICT', 'This request key was already used for a different question.', 409) };
    }
    const { data: existingBot, error: existingBotErr } = await service
      .from('chatbot_messages')
      .select('id, body, kb_matched, answer_language, privacy_blocked')
      .eq('reply_to_message_id', existingUser.id)
      .eq('role', 'bot')
      .maybeSingle();
    if (existingBotErr) return { response: apiFail('DB_ERROR', 'Unable to check the previous answer.', 503) };
    if (!existingBot) return { response: null, userMessageId: existingUser.id as string };
    await service.rpc('reconcile_chatbot_ask_operation', {
      p_operation_id: operationId,
      p_actor_key: actorKey,
      p_session_id: session.id,
      p_user_message_id: existingUser.id,
      p_bot_message_id: existingBot.id,
    });
    return { response: apiOk({ sessionKey: session.session_key, answer: existingBot.body, botAnswered: existingBot.kb_matched, messageId: existingBot.id, userMessageId: existingUser.id, language: existingBot.answer_language, privacyBlocked: existingBot.privacy_blocked }), userMessageId: existingUser.id as string };
  };

  const { data: reservation, error: reservationError } = await service.rpc('reserve_support_operation', {
    p_operation_id: operationId,
    p_actor_key: actorKey,
    p_owner_user_id: user?.id ?? null,
    p_session_id: session.id,
    p_kind: 'ask',
    p_payload_hash: operationPayloadHash,
  });
  if (reservationError) {
    return reservationError.code === '23505'
      ? apiFail('OPERATION_CONFLICT', 'This request key was already used for a different question.', 409)
      : apiFail('DB_ERROR', 'Unable to check the previous request.', 503);
  }
  const operation = reservation as { state?: string; shouldExecute?: boolean; leaseToken?: string; resultId?: string | null; created?: boolean } | null;
  if (!operation || operation.state !== 'running' || operation.shouldExecute !== true || !operation.leaseToken) {
    if (operation?.state === 'completed' || operation?.state === 'unknown') {
      const completed = await findExistingAnswer();
      if (completed.response) return completed.response;
    }
    return apiFail('OPERATION_UNKNOWN', 'This request is already being checked or its result is not confirmed. Check chat history before sending again.', 409);
  }

  const prior = await findExistingAnswer();
  if (prior.response) return prior.response;
  if (prior.userMessageId && operation.created) {
    await service.rpc('mark_support_operation_unknown', {
      p_operation_id: operationId,
      p_actor_key: actorKey,
      p_lease_token: operation.leaseToken,
      p_safe_code: 'LEGACY_OPERATION_UNCERTAIN',
    });
    return apiFail('OPERATION_UNKNOWN', 'This question was already submitted before its result could be checked. Check chat history before sending it again.', 409);
  }

  let userMessageId = prior.userMessageId;
  if (!userMessageId) {
    const { data: userMsg, error: userMsgErr } = await service
      .from('chatbot_messages')
      .insert({ session_id: session.id, role: 'user', body: cleaned.display, pii_detected: cleaned.hadPII, operation_id: operationId, operation_payload_hash: operationPayloadHash })
      .select('id')
      .single();
    if (userMsgErr?.code === '23505') {
      const raced = await findExistingAnswer();
      if (raced.response) return raced.response;
      if (raced.userMessageId && !operation.created) {
        userMessageId = raced.userMessageId;
      } else {
        await service.rpc('mark_support_operation_unknown', {
          p_operation_id: operationId,
          p_actor_key: actorKey,
          p_lease_token: operation.leaseToken,
          p_safe_code: 'LEGACY_OPERATION_UNCERTAIN',
        });
        return apiFail('OPERATION_UNKNOWN', 'The previous answer is still being confirmed. Check chat history before sending again.', 409);
      }
    } else {
      if (userMsgErr) return apiFail('DB_ERROR', 'Unable to save the question.', 503);
      userMessageId = userMsg.id;
    }
  }
  if (!userMessageId) return apiFail('OPERATION_UNKNOWN', 'The previous question could not be confirmed. Check chat history before sending again.', 409);

  const privacyBlocked = !prepareExternalText(question).allowed;
  const useAi = !privacyBlocked && await reserveAiQuota(request, 'chatbot', user?.id ?? null);
  const beforeExternalCall = useAi ? async () => {
    const { data: externalStarted, error: externalStartError } = await service.rpc('mark_support_operation_external_started', {
      p_operation_id: operationId,
      p_actor_key: actorKey,
      p_lease_token: operation.leaseToken,
    });
    if (externalStartError || externalStarted !== true) throw new Error('support_operation_lease_lost');
  } : undefined;
  const result = useAi
    ? await answerQuestion(cleaned.display, true, beforeExternalCall)
    : await answerQuestion(cleaned.display, false);

  // Slurs are a safety issue, not just civility — surfaced to admin even
  // though the message itself was masked and allowed through. Never blocks
  // the response (fire-and-forget from the caller's perspective — see
  // logModerationFlag's own never-throws contract).
  if (cleaned.hadSlur) {
    await logModerationFlag(service, {
      sourceType: 'chatbot_message',
      sourceId: userMessageId,
      userId: user?.id ?? null,
      originalExcerpt: cleaned.original,
    });
  }

  const { data: botMessageId, error: botMsgErr } = await service.rpc('complete_chatbot_ask_operation', {
    p_operation_id: operationId,
    p_actor_key: actorKey,
    p_lease_token: operation.leaseToken,
    p_session_id: session.id,
    p_user_message_id: userMessageId,
    p_answer: result.answer,
    p_kb_matched: result.kbMatched,
    p_answer_language: result.language,
    p_privacy_blocked: privacyBlocked,
  });
  if (botMsgErr || typeof botMessageId !== 'string') return apiFail('OPERATION_UNKNOWN', 'Your question was saved, but the answer could not be confirmed. Check chat history before sending again.', 503);

  // Provenance — which KB docs (and their similarity, for RAG mode) backed
  // this answer. See CLAUDE-PHASE2.md Feature A: "show which KB docs it
  // used and their similarity scores." Best-effort: a failure here shouldn't
  // fail the whole request, the user already has their answer.
  if (result.usedKb.length > 0) {
    const { error: refErr } = await service.from('chatbot_message_kb_refs').insert(
      result.usedKb.map((k) => ({ message_id: botMessageId, document_id: k.id, score: k.similarity })),
    );
    if (refErr) console.error('[chatbot] failed to log kb refs', refErr.message);
  }

  // CLAUDE-CHATBOT-FEEDBACK.md: this endpoint answers; it never escalates on
  // its own. botAnswered (== kbMatched: the bot produced a real answer, not
  // the honest fallback) tells the widget which feedback flow to render —
  // "was this helpful?" vs going straight to the ticket offer. messageId
  // lets the widget attach feedback/ticket state to this specific reply.
  // CLAUDE-P4-EXTRAS.md Extra 1: language lets the widget localize that
  // feedback-flow chrome (see lib/chatbot/strings.ts) to match this reply.
  return apiOk({ sessionKey: session.session_key, answer: result.answer, botAnswered: result.kbMatched, messageId: botMessageId, userMessageId: userMessageId, language: result.language, privacyBlocked });
}
