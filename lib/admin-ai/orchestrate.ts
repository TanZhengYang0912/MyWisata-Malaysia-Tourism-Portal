// P4 — Member 4: admin chatbot orchestration. CLAUDE-ADMIN-AI.md Part 2, Capability 1.
//
// Flow (per spec):
//   admin question → redactPII (defence in depth) → LLM picks a query from
//   the registry + extracts params (JSON tool-call style) → run THAT query
//   server-side (parameterised) → feed the aggregate RESULT back to the LLM
//   → LLM phrases the answer in natural language.
//
// Two Gemini calls, never one that both picks AND phrases with un-vetted
// data in the same turn: the PICKER call only ever sees the question and
// the registry's names/descriptions — no data. The PHRASER call only ever
// sees the question and the (already-computed, already-safe) aggregate
// result — no raw rows, because none were ever fetched into this pipeline
// except through a registered query.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { callGemini } from './gemini';
import { redactPII } from '@/lib/chatbot/pii';
import { QUERY_REGISTRY, findQuery, registryDescription, type AggregateResult } from './queries';

const pickerResponseSchema = z.union([
  z.object({ query: z.null() }).strict(),
  z.object({ query: z.string(), params: z.record(z.string(), z.unknown()).optional() }).strict(),
]);

const PICKER_SYSTEM_PROMPT = `You are a query router for an internal admin analytics assistant.
You do NOT answer questions. You ONLY decide which ONE registered query (if any) can answer the
admin's question, and extract its parameters.

Registered queries — each description ends with its exact Params shape. Use those EXACT key names,
never invent your own (e.g. "withdrawals_over_amount" takes {"amountRM": number}, not {"amount": ...}).

${registryDescription()}

Example: "show me withdrawals over 500" -> {"query": "withdrawals_over_amount", "params": {"amountRM": 500}}
Example: "how many orders has jane@example.com placed" -> {"query": "orders_count_for_customer", "params": {"email": "jane@example.com"}}

A question that names a specific customer (by email, id, or name) is NOT automatically unanswerable —
route it to a registered query if one exists for it (e.g. orders_count_for_customer). Those queries
return only a COUNT for that customer, never their personal data, so this is safe. Only answer
{"query": null} for a named-customer question if it asks for something no registered query returns —
e.g. their email/phone/IC/address/bank details, their order details, or any other raw personal data.

Respond with ONLY strict JSON, no markdown, no commentary:
- If one query answers it: {"query": "<name>", "params": {...}}
- If none of the registered queries can answer it: {"query": null}`;

// Only ever called with a real, already-computed DATA RESULT — see
// answerAdminQuestion() below, which short-circuits to FALLBACK_ANSWER
// before this prompt is ever used when no query matched. That split (fixed
// string for "no data", LLM only for "phrase this real result") is
// deliberate: asking the model to freeform "list what you can answer" was
// exactly what produced the raw registry-dump bug this was built to fix —
// a static message can't regress that way.
const PHRASER_SYSTEM_PROMPT = `You are the admin assistant for MyWisata, for platform staff only.

You answer questions about platform metrics — but ONLY from the DATA RESULT provided to you below.
Never guess a number, and never add facts that aren't in DATA RESULT.

DATA RESULT is always a safe aggregate (a count, sum, or list of names) — it is structurally
guaranteed to never contain personal data (emails, phone numbers, IC numbers, addresses, bank
details), even when the question named a specific customer. So: answer plainly and factually from
DATA RESULT, including when it's a count "for" a named customer — that count is not PII, do not
refuse to state it.

Be concise and professional.

Reply in PLAIN TEXT ONLY — the UI renders your response as-is, with no markdown parser. Never use
markdown syntax: no "*", no "**", no "-" or "•" bullets, no "#" headings, no backticks. For a
breakdown of several values, put each on its own line as "Label: value", for example:
General: 11
Withdrawal: 1
Payment: 1
For a single number, just say it in a plain sentence.`;

// Fix 2 (CLAUDE-ADMIN-AI-EXPAND.md): a fixed string, not an LLM phrasing —
// names broad categories only, never the raw query registry.
const NO_MATCH_ANSWER =
  "Sorry, I couldn't find data for that. Could you rephrase, or ask about vendors, products, KYC, orders, withdrawals, recommendations, tickets, or affiliates?";

function extractJson(text: string): unknown {
  const stripped = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(stripped);
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * The picker only ever sees the question AFTER redactPII() has run (every
 * callGemini() call redacts its userText) — so if the model echoes back an
 * "email" param, the value it saw and copied can only ever be the [EMAIL]
 * placeholder token, never the real address. Re-derive the real value here
 * from the ORIGINAL, unredacted question (already in scope, never sent to
 * Gemini) rather than trusting the echoed token. Keeps the redaction
 * boundary fully intact — Gemini still never sees a real email, in either
 * the picker or phraser call — while letting email-keyed queries actually
 * resolve to the right customer.
 */
function derealizeEmailParam(rawParams: Record<string, unknown>, originalQuestion: string): Record<string, unknown> {
  if (rawParams.email !== '[EMAIL]') return rawParams;
  const match = originalQuestion.match(EMAIL_RE);
  return { ...rawParams, email: match ? match[0] : rawParams.email };
}

export interface AdminAskResult {
  answer: string;
  piiDetected: boolean;
  queryUsed: string | null;
}

export async function answerAdminQuestion(service: SupabaseClient, question: string): Promise<AdminAskResult> {
  const piiDetected = redactPII(question).found;

  let aggregateResult: AggregateResult | null = null;
  let queryUsed: string | null = null;

  try {
    const pickerRaw = await callGemini(PICKER_SYSTEM_PROMPT, question, { temperature: 0, maxOutputTokens: 200 });
    const parsed = pickerResponseSchema.safeParse(extractJson(pickerRaw));

    if (parsed.success && parsed.data.query) {
      const queryDef = findQuery(parsed.data.query);
      if (queryDef) {
        const rawParams = derealizeEmailParam(parsed.data.params ?? {}, question);
        const paramsResult = queryDef.paramsSchema.safeParse(rawParams);
        // An invalid/hallucinated param set is treated as "no query matched" —
        // never guess at what the admin meant, per CLAUDE-ADMIN-AI.md's
        // "Never improvise a query."
        if (paramsResult.success) {
          aggregateResult = await queryDef.run(service, paramsResult.data);
          queryUsed = queryDef.name;
        }
      }
    }
  } catch (error) {
    console.error('[admin-ai] query-picker step failed, proceeding with no data result', error instanceof Error ? error.message : error);
    // fall through — aggregateResult stays null, handled below same as "no query matched"
  }

  if (!aggregateResult) {
    return { answer: NO_MATCH_ANSWER, piiDetected, queryUsed: null };
  }

  const userText = `ADMIN QUESTION: ${question}\n\nDATA RESULT:\n${JSON.stringify(aggregateResult)}`;
  const answer = await callGemini(PHRASER_SYSTEM_PROMPT, userText, { temperature: 0.2, maxOutputTokens: 300 });

  return { answer, piiDetected, queryUsed };
}

export { QUERY_REGISTRY };
