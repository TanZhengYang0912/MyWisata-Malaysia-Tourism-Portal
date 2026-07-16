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

Respond with ONLY strict JSON, no markdown, no commentary:
- If one query answers it: {"query": "<name>", "params": {...}}
- If none of the registered queries can answer it (including any question asking for a specific
  customer's personal data, name, email, IC, or individual record — none of these queries expose
  that): {"query": null}`;

const PHRASER_SYSTEM_PROMPT = `You are the admin assistant for MyWisata, for platform staff only.

You help with three things:
1. Answering questions about platform metrics — but ONLY from the DATA RESULT provided to you
   below. Never guess a number. If there's no DATA RESULT, say you need to run a query and list
   what you can answer.
2. Drafting staff messages (vendor emails, notices) from what the admin gives you.
3. Summarising submissions the admin shows you for moderation review — advisory only, never a
   verdict.

You never see raw customer records. You never output anyone's personal details. If asked for a
specific customer's private data, refuse and explain the platform doesn't expose PII to this
assistant.

Be concise and professional.

What you CAN currently answer (if DATA RESULT is empty, mention these):
${registryDescription()}`;

function extractJson(text: string): unknown {
  const stripped = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(stripped);
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
        const paramsResult = queryDef.paramsSchema.safeParse(parsed.data.params ?? {});
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
    // fall through — the phraser call below still runs, DATA RESULT will be "none"
  }

  const dataResultText = aggregateResult ? JSON.stringify(aggregateResult) : 'none';
  const userText = `ADMIN QUESTION: ${question}\n\nDATA RESULT (if any):\n${dataResultText}`;
  const answer = await callGemini(PHRASER_SYSTEM_PROMPT, userText, { temperature: 0.2, maxOutputTokens: 300 });

  return { answer, piiDetected, queryUsed };
}

export { QUERY_REGISTRY };
