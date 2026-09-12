// P4 — Member 4: FAQ chatbot
// POST /api/chatbot/ask — body { sessionKey?, question }. See CLAUDE.md Step 7,
// upgraded to the RAG/LLM pipeline in CLAUDE-PHASE2.md Feature A.
//
// chatbot_sessions/chatbot_messages have RLS enabled with SELECT-only
// policies (own-or-guest) — no INSERT policy exists on either table
// (007_public_read_policies.sql), so writes need the service-role client,
// same pattern as orders/order_items (CLAUDE.md Section 2/Section 6).

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { chatbotAskSchema } from '@/lib/validation/chatbot-schemas';
import { answerQuestion } from '@/lib/chatbot/answer';
import { cleanUserContent } from '@/lib/moderation/clean';
import { logModerationFlag } from '@/lib/moderation/flags';

export async function POST(request: Request) {
  const parsed = await parseBody(request, chatbotAskSchema);
  if (!parsed.ok) return parsed.response;
  const { sessionKey, question } = parsed.data;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const service = createServiceClient();

  let session: { id: string; session_key: string } | null = null;
  if (sessionKey) {
    const { data } = await service
      .from('chatbot_sessions')
      .select('id, session_key')
      .eq('session_key', sessionKey)
      .maybeSingle();
    session = data ?? null;
  }
  if (!session) {
    const { data: created, error: createErr } = await service
      .from('chatbot_sessions')
      .insert({ user_id: user?.id ?? null, session_key: sessionKey ?? crypto.randomUUID() })
      .select('id, session_key')
      .single();
    if (createErr) return apiFail('DB_ERROR', createErr.message, 500);
    session = created;
  }

  // CLAUDE-MODERATION.md Part 3: cleanUserContent() is the one entry point —
  // profanity masked, PII redacted — applied BEFORE storage and BEFORE the
  // LLM ever sees the question. Supersedes CLAUDE-ADMIN-AI.md's earlier
  // "store the original for the user's own view" design: that doc scoped
  // redaction to the Gemini call only; this one is explicit that PII must
  // stay out of storage too (Part 1's table: "Keep sensitive data OUT of
  // storage + off external APIs"). The user's own message now displays
  // masked, same as everyone else's view of it.
  const cleaned = cleanUserContent(question);
  const result = await answerQuestion(cleaned.display);

  const { data: userMsg, error: userMsgErr } = await service
    .from('chatbot_messages')
    .insert({ session_id: session.id, role: 'user', body: cleaned.display, pii_detected: cleaned.hadPII })
    .select('id')
    .single();
  if (userMsgErr) return apiFail('DB_ERROR', userMsgErr.message, 500);

  // Slurs are a safety issue, not just civility — surfaced to admin even
  // though the message itself was masked and allowed through. Never blocks
  // the response (fire-and-forget from the caller's perspective — see
  // logModerationFlag's own never-throws contract).
  if (cleaned.hadSlur) {
    await logModerationFlag(service, {
      sourceType: 'chatbot_message',
      sourceId: userMsg.id,
      userId: user?.id ?? null,
      originalExcerpt: cleaned.original,
    });
  }

  const { data: botMsg, error: botMsgErr } = await service
    .from('chatbot_messages')
    .insert({ session_id: session.id, role: 'bot', body: result.answer, kb_matched: result.kbMatched })
    .select('id')
    .single();
  if (botMsgErr) return apiFail('DB_ERROR', botMsgErr.message, 500);

  // Provenance — which KB docs (and their similarity, for RAG mode) backed
  // this answer. See CLAUDE-PHASE2.md Feature A: "show which KB docs it
  // used and their similarity scores." Best-effort: a failure here shouldn't
  // fail the whole request, the user already has their answer.
  if (result.usedKb.length > 0) {
    const { error: refErr } = await service.from('chatbot_message_kb_refs').insert(
      result.usedKb.map((k) => ({ message_id: botMsg.id, document_id: k.id, score: k.similarity })),
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
  return apiOk({ sessionKey: session.session_key, answer: result.answer, botAnswered: result.kbMatched, messageId: botMsg.id, language: result.language });
}
