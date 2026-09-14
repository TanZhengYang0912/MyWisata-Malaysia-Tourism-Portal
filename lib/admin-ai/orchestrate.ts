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
import {
  findCapability,
  matchCapabilityByKeywords,
  capabilityRegistryDescription,
  capabilityContext,
  capabilityOverviewContext,
} from './capabilities';

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

A PROCEDURAL question is not a data question — answer {"query": null} for it, so it can be routed
to the help content instead. These ask how to do something, where to find something, who is allowed
to do something, or what a section of the admin panel is for, and they want instructions rather than
a number. For example "where do I review KYC submissions" and "how do I approve a withdrawal" are
both {"query": null}, even though registered queries exist about KYC and withdrawals. "How many KYC
submissions are pending" is still a data question.

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
const PHRASER_SYSTEM_PROMPT = `You are the admin assistant for MyLawatan, for platform staff only.

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
// names broad categories only, never the raw query registry. Extended for
// the how-to path below, still as a static string for the same reason.
const NO_MATCH_ANSWER =
  "Sorry, I couldn't find data for that. Could you rephrase, or ask about vendors, products, KYC, orders, withdrawals, recommendations, tickets, or affiliates? You can also ask how to perform an admin task — for example \"how do I approve a withdrawal?\"";

// ── How-to path (this file's second router) ────────────────────────────────
// Runs ONLY when the data picker above found no query — i.e. on questions
// that used to dead-end at NO_MATCH_ANSWER. The data path's prompts, calls,
// and latency are deliberately untouched: that path is the bot's primary,
// already-tested job, and folding both routers into one picker call would
// put the well-behaved one at risk of regression for no benefit.
//
// No DB access on this path at all — the context is static text from
// lib/admin-ai/capabilities.ts, so there is no row, no aggregate, and no
// customer data anywhere in it. That makes it strictly safer than the data
// path, not a new exposure surface.

const capabilityPickerResponseSchema = z.union([
  z.object({ capability: z.null() }).strict(),
  z.object({ capability: z.string() }).strict(),
]);

const CAPABILITY_PICKER_SYSTEM_PROMPT = `You are a router for an internal admin assistant's help content.
You do NOT answer questions. You ONLY decide which ONE admin panel section (if any) the admin's
question is about — questions like "how do I do X", "where do I X", "what is this section for",
"who can do X", "what can I do here".

Sections:
${capabilityRegistryDescription()}

Use "overview" if the admin is asking broadly what they can do across the whole admin panel, or
what sections exist, rather than about one specific section.

Respond with ONLY strict JSON, no markdown, no commentary:
- If one section fits: {"capability": "<name>"}
- If the question is broad/panel-wide: {"capability": "overview"}
- If none fit: {"capability": null}`;

const CAPABILITY_PHRASER_SYSTEM_PROMPT = `You are the admin assistant for MyLawatan, for platform staff only.

The admin asked how to do something in the admin panel, or what part of it is for. Answer ONLY
from the SECTION INFO provided below. It is the complete set of facts you may use.

Never invent a step, a button, a permission, a limit, or a turnaround time that is not in SECTION
INFO. If SECTION INFO does not cover what was asked, say what the section does cover and point to
its path, rather than guessing.

Always state where to go (the path) and, when SECTION INFO says a section is Super Admin only, say
so — an approver reading a confident answer about a section they cannot open is a wasted trip.

Be concise and professional: a short answer, then the specific steps or options if the question
asked how.

Reply in PLAIN TEXT ONLY — the UI renders your response as-is, with no markdown parser. Never use
markdown syntax: no "*", no "**", no "-" or "•" bullets, no "#" headings, no backticks. When you
need to list steps or options, put each on its own line.`;

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
  /** Which capability entry answered a how-to question, if one did. */
  capabilityUsed?: string | null;
}

/**
 * Second router: procedural "how do I…" questions. Returns null when the
 * question isn't a how-to one (or the LLM call fails) so the caller can fall
 * back to NO_MATCH_ANSWER — never throws, and never blocks the data path.
 */
async function answerCapabilityQuestion(
  question: string,
): Promise<{ answer: string; capabilityUsed: string } | null> {
  let context: string;
  let capabilityUsed: string;

  // Fast path: an unambiguous keyword hit skips the picker call entirely.
  const keywordMatch = matchCapabilityByKeywords(question);
  if (keywordMatch) {
    context = capabilityContext(keywordMatch);
    capabilityUsed = keywordMatch.name;
  } else {
    try {
      const pickerRaw = await callGemini(CAPABILITY_PICKER_SYSTEM_PROMPT, question, {
        temperature: 0,
        maxOutputTokens: 100,
      });
      const parsed = capabilityPickerResponseSchema.safeParse(extractJson(pickerRaw));
      if (!parsed.success || !parsed.data.capability) return null;

      if (parsed.data.capability === 'overview') {
        context = capabilityOverviewContext();
        capabilityUsed = 'overview';
      } else {
        const capability = findCapability(parsed.data.capability);
        // A hallucinated section name is treated as no match — same rule as
        // the data path's invalid-params case: never guess at what was meant.
        if (!capability) return null;
        context = capabilityContext(capability);
        capabilityUsed = capability.name;
      }
    } catch (error) {
      console.error('[admin-ai] capability-picker step failed', error instanceof Error ? error.message : error);
      return null;
    }
  }

  const userText = `ADMIN QUESTION: ${question}\n\nSECTION INFO:\n${context}`;
  const answer = await callGemini(CAPABILITY_PHRASER_SYSTEM_PROMPT, userText, {
    temperature: 0.2,
    maxOutputTokens: 400,
  });
  return { answer, capabilityUsed };
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
    // No registered data query fits — before giving up, try the how-to
    // router. This is purely additive: every question reaching here already
    // had NO_MATCH_ANSWER as its outcome.
    const capabilityAnswer = await answerCapabilityQuestion(question);
    if (capabilityAnswer) {
      return {
        answer: capabilityAnswer.answer,
        piiDetected,
        queryUsed: null,
        capabilityUsed: capabilityAnswer.capabilityUsed,
      };
    }
    return { answer: NO_MATCH_ANSWER, piiDetected, queryUsed: null, capabilityUsed: null };
  }

  const userText = `ADMIN QUESTION: ${question}\n\nDATA RESULT:\n${JSON.stringify(aggregateResult)}`;
  const answer = await callGemini(PHRASER_SYSTEM_PROMPT, userText, { temperature: 0.2, maxOutputTokens: 300 });

  return { answer, piiDetected, queryUsed, capabilityUsed: null };
}

export { QUERY_REGISTRY };
