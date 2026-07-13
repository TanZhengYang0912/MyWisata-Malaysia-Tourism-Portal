// P4 — Member 4: RAG chatbot single entry point. CLAUDE-PHASE2.md Feature A.
//
// ⚠️ On "keep the existing signature so callers don't change" (spec quote):
// the literal existing lib/chatbot/match.ts::answerQuestion() is actually
// `(question, docs) => KbDoc | null` — two args, sync, no DB access (Step 7
// deliberately kept it "pure, no framework imports", with the caller
// responsible for fetching docs). That shape can't become the async,
// DB-touching, LLM-calling orchestrator this feature needs without
// contradicting its own reason for being pure. Read as intent rather than
// literally: this file is the NEW single public entry point the spec
// describes (question in, AnswerResult out), and match.ts's function
// becomes an internal implementation detail — the fallback path's matcher,
// no longer imported directly by any route. Every current caller (only
// app/api/chatbot/ask/route.ts) is being updated in this same feature to
// call THIS function instead, so nothing breaks.
//
// Graceful degradation (CLAUDE-PHASE2.md Section 7, mandatory):
//   - no LLM_API_KEY           -> keyword fallback, never attempted the LLM
//   - retrieval finds nothing  -> escalate, LLM never called at all
//   - LLM says NO_ANSWER       -> escalate, same as no match
//   - embedding/RPC/LLM throws or times out -> keyword fallback
// The bot must never be down because an API key expired or a network call
// failed — every one of those paths still returns a normal AnswerResult.
//
// CLAUDE-FIXES.md Fix 1 Step 1: an intent gate runs FIRST, before any of the
// above. "hi", "thanks", "ok" etc. were previously treated as questions with
// no matching KB doc, and escalated — technically correct under the old
// rules, useless in practice. classifyIntent() catches these before
// retrieval or the LLM are ever touched, and — critically — before the
// `LLM_API_KEY` check, so greetings work identically with or without a key.

import { createServiceClient } from '@/lib/supabase/service';
import { retrieve } from './retrieve';
import { generateAnswer } from './generate';
import { answerQuestion as matchKeyword, type KbDoc } from './match';
import { classifyIntent } from './intent';

export const FALLBACK_ANSWER = "Sorry, I don't know that one. Would you like our team to help?";
const GREETING_REPLY =
  "Hi! I'm the MyWisata assistant. I can help with bookings, vouchers, your wallet, withdrawals, or affiliate earnings. What do you need?";
const CHITCHAT_REPLY = "Glad to help! Let me know if there's anything else you need.";
const UNCLEAR_REPLY = "Could you tell me a bit more about what you need help with?";

export interface UsedKbRef {
  id: string;
  /** null for keyword-mode matches — that path has no continuous similarity score. */
  similarity: number | null;
}

export interface AnswerResult {
  answer: string;
  kbMatched: boolean;
  canEscalate: boolean;
  usedKb: UsedKbRef[];
  mode: 'llm' | 'keyword' | 'intent';
}

async function answerWithKeywordFallback(service: ReturnType<typeof createServiceClient>, question: string): Promise<AnswerResult> {
  const { data: kbRows } = await service
    .from('chatbot_kb_documents')
    .select('id, title, body, keywords, category')
    .eq('is_active', true);

  const docs: KbDoc[] = (kbRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    keywords: row.keywords ?? [],
    category: row.category,
  }));

  const match = matchKeyword(question, docs);
  return match
    ? { answer: match.body, kbMatched: true, canEscalate: false, usedKb: [{ id: match.id, similarity: null }], mode: 'keyword' }
    : { answer: FALLBACK_ANSWER, kbMatched: false, canEscalate: true, usedKb: [], mode: 'keyword' };
}

export async function answerQuestion(question: string): Promise<AnswerResult> {
  // Never escalate, never retrieve, never call the LLM for these — see the
  // file header and lib/chatbot/intent.ts. kbMatched: true because the bot
  // DID successfully handle the message; marking it false would (a) offer
  // a "get help from our team" button for someone who just said "hi", and
  // (b) pollute the admin's "top unanswered questions" list with greetings.
  const intent = classifyIntent(question);
  if (intent === 'greeting') {
    return { answer: GREETING_REPLY, kbMatched: true, canEscalate: false, usedKb: [], mode: 'intent' };
  }
  if (intent === 'chitchat') {
    return { answer: CHITCHAT_REPLY, kbMatched: true, canEscalate: false, usedKb: [], mode: 'intent' };
  }
  if (intent === 'unclear') {
    return { answer: UNCLEAR_REPLY, kbMatched: true, canEscalate: false, usedKb: [], mode: 'intent' };
  }

  const service = createServiceClient();

  if (process.env.LLM_API_KEY) {
    try {
      const retrieved = await retrieve(service, question, 3);
      if (retrieved.length === 0) {
        // Threshold check happens BEFORE the LLM call — the model never
        // sees an off-topic question at all. See lib/chatbot/retrieve.ts.
        return { answer: FALLBACK_ANSWER, kbMatched: false, canEscalate: true, usedKb: [], mode: 'llm' };
      }

      const usedKb: UsedKbRef[] = retrieved.map((r) => ({ id: r.id, similarity: r.similarity }));
      const llmAnswer = await generateAnswer(question, retrieved);

      if (llmAnswer === null) {
        // NO_ANSWER — still record which docs were retrieved/considered,
        // useful admin-side provenance even though the model couldn't
        // ground an answer in them.
        return { answer: FALLBACK_ANSWER, kbMatched: false, canEscalate: true, usedKb, mode: 'llm' };
      }

      return { answer: llmAnswer, kbMatched: true, canEscalate: false, usedKb, mode: 'llm' };
    } catch (error) {
      console.error('[chatbot] LLM pipeline failed, falling back to keyword matcher', error instanceof Error ? error.message : error);
      // fall through to keyword fallback below
    }
  }

  return answerWithKeywordFallback(service, question);
}
