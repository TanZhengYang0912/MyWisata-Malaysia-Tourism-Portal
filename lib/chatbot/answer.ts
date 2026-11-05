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
import { retrieve, type RetrievedDoc } from './retrieve';
import { generateAnswer } from './generate';
import { answerQuestion as matchKeyword, type KbDoc } from './match';
import { classifyIntent, splitQuestions } from './intent';
import { redactPII } from './pii';
import { detectLanguage, type ChatLanguage } from './language';
import { CHAT_STRINGS } from './strings';

// CLAUDE-CHATBOT-FEEDBACK.md Flow 2: this line IS the ticket offer's lead-in
// now — no separate "would you like our team to help?" phrasing needed here
// since the widget renders the actual yes/no ticket offer as its own box
// right below this message.
//
// CLAUDE-P4-EXTRAS.md Extra 1: kept as the English default export (nothing
// else in the repo imports it, but it's referenced in a comment in
// lib/admin-ai/orchestrate.ts) — the actual per-language values now live in
// lib/chatbot/strings.ts, picked below via detectLanguage().
export const FALLBACK_ANSWER = CHAT_STRINGS.en.fallback;

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
  /** Whether redactPII() found anything in the raw question — independent
   *  of mode, since this describes what the user typed, not how it was
   *  answered. CLAUDE-ADMIN-AI.md Part 1: logged on the message row. */
  piiDetected: boolean;
  /** Lightweight pre-detection of the QUESTION's language (see
   *  lib/chatbot/language.ts) — used to pick which language's fixed
   *  strings this result used, and returned so the widget can localize the
   *  feedback-flow chrome (Was this helpful?/ticket offer) that sits next
   *  to this specific reply. Not a claim about what language `answer` is
   *  in for `mode: 'llm'` — Gemini decides that itself from the system
   *  prompt — but the two should agree in practice since both start from
   *  the same question. */
  language: ChatLanguage;
}

/** Several questions: fewer docs each, so all of them fit in the context (max 6). */
function retrievalCount(questionCount: number): number {
  return questionCount > 1 ? 2 : 3;
}

/** One retrieval per question, deduped by doc id (best similarity wins), best first. */
function mergeRetrieved(lists: RetrievedDoc[][]): RetrievedDoc[] {
  const best = new Map<string, RetrievedDoc>();
  for (const doc of lists.flat()) {
    const seen = best.get(doc.id);
    if (!seen || doc.similarity > seen.similarity) best.set(doc.id, doc);
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity);
}

async function answerWithKeywordFallback(
  service: ReturnType<typeof createServiceClient>,
  questions: string[],
  piiDetected: boolean,
  language: ChatLanguage,
): Promise<AnswerResult> {
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

  // The keyword matcher only ever scores against an English KB (Extra 1
  // deliberately doesn't translate the KB — see lib/chatbot/retrieve.ts's
  // header), so its ANSWER is always English regardless of `language`. Only
  // the fallback line (no match at all) gets localized here — there's
  // nothing to translate on a successful match without risking exactly the
  // "subtly wrong translation" the extras doc warns about, and this path
  // only runs when the LLM is unavailable/failing anyway.
  // One match per question, each doc shown once.
  const matches = [...new Map(
    questions.map((q) => matchKeyword(q, docs)).filter((doc): doc is KbDoc => doc !== null).map((doc) => [doc.id, doc]),
  ).values()];
  return matches.length > 0
    ? { answer: matches.map((doc) => doc.body).join('\n\n'), kbMatched: true, canEscalate: false, usedKb: matches.map((doc) => ({ id: doc.id, similarity: null })), mode: 'keyword', piiDetected, language }
    : { answer: CHAT_STRINGS[language].fallback, kbMatched: false, canEscalate: true, usedKb: [], mode: 'keyword', piiDetected, language };
}

/** `useAi: false` (caller over its AI quota) answers from the keyword matcher instead of the LLM. */
export async function answerQuestion(question: string, useAi = true): Promise<AnswerResult> {
  // Computed once from the raw question, independent of which mode ends up
  // answering it — a keyword-mode or intent-gated reply can still follow a
  // message that contained PII. The actual redaction enforcement lives in
  // embed.ts/generate.ts themselves (defence in depth); this call is purely
  // for the pii_detected signal the route logs on the message row.
  const piiDetected = redactPII(question).found;

  // CLAUDE-P4-EXTRAS.md Extra 1: computed once, used to pick every fixed
  // string below (this function never calls a translation service — see
  // lib/chatbot/language.ts's header for why a lightweight heuristic here
  // is sufficient).
  const language = detectLanguage(question);

  // Never escalate, never retrieve, never call the LLM for these — see the
  // file header and lib/chatbot/intent.ts. kbMatched: true because the bot
  // DID successfully handle the message; marking it false would (a) offer
  // a "get help from our team" button for someone who just said "hi", and
  // (b) pollute the admin's "top unanswered questions" list with greetings.
  const intent = classifyIntent(question);
  const strings = CHAT_STRINGS[language];
  if (intent === 'greeting') {
    return { answer: strings.greeting, kbMatched: true, canEscalate: false, usedKb: [], mode: 'intent', piiDetected, language };
  }
  if (intent === 'chitchat') {
    return { answer: strings.chitchat, kbMatched: true, canEscalate: false, usedKb: [], mode: 'intent', piiDetected, language };
  }
  if (intent === 'unclear') {
    return { answer: strings.unclear, kbMatched: true, canEscalate: false, usedKb: [], mode: 'intent', piiDetected, language };
  }

  const service = createServiceClient();
  const questions = splitQuestions(question);

  if (useAi && process.env.LLM_API_KEY) {
    try {
      // Each question clears the similarity threshold on its own, so one
      // off-topic question no longer sinks an on-topic one beside it.
      const k = retrievalCount(questions.length);
      const retrieved = mergeRetrieved(await Promise.all(questions.map((q) => retrieve(service, q, k))));
      if (retrieved.length === 0) {
        // Threshold check happens BEFORE the LLM call — the model never
        // sees an off-topic question at all. See lib/chatbot/retrieve.ts.
        return { answer: strings.fallback, kbMatched: false, canEscalate: true, usedKb: [], mode: 'llm', piiDetected, language };
      }

      const usedKb: UsedKbRef[] = retrieved.map((r) => ({ id: r.id, similarity: r.similarity }));
      const llmAnswer = await generateAnswer(question, retrieved, questions.length);

      if (llmAnswer === null) {
        // NO_ANSWER — still record which docs were retrieved/considered,
        // useful admin-side provenance even though the model couldn't
        // ground an answer in them.
        return { answer: strings.fallback, kbMatched: false, canEscalate: true, usedKb, mode: 'llm', piiDetected, language };
      }

      return { answer: llmAnswer, kbMatched: true, canEscalate: false, usedKb, mode: 'llm', piiDetected, language };
    } catch (error) {
      console.error('[chatbot] LLM pipeline failed, falling back to keyword matcher', error instanceof Error ? error.message : error);
      // fall through to keyword fallback below
    }
  }

  return answerWithKeywordFallback(service, questions, piiDetected, language);
}
