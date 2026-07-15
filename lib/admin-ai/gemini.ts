// P4 — Member 4: shared low-level Gemini caller for the admin-ai module.
// CLAUDE-ADMIN-AI.md Part 2 reuses "same Gemini client, same key" across
// three call sites (drafting, query-picking, moderation review) — factored
// out here rather than duplicated three times. Deliberately NOT merged into
// lib/chatbot/generate.ts: that file serves the customer chatbot's RAG
// pipeline (fixed system prompt, NO_ANSWER contract, keyword-fallback
// caller) and shouldn't be reshaped around a second, differently-shaped
// caller.
//
// No keyword fallback here by design (CLAUDE-ADMIN-AI.md: "this bot has no
// keyword fallback — if the LLM is down, it says 'assistant unavailable'").
// Throws on any failure; every caller in this module is expected to catch
// and surface that as an unavailable-assistant response, never let it
// become an unhandled 500.

import { redactPII } from '@/lib/chatbot/pii';

const GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';
const GENERATE_TIMEOUT_MS = 15_000;

interface GeminiGenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export interface CallGeminiOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Redacts userText before sending — the hard boundary, same as
 * lib/chatbot/embed.ts/generate.ts. systemPrompt is always our own static
 * text, never redacted. Callers that need to know WHETHER anything was
 * found (e.g. to log pii_detected on a message row) should call
 * redactPII() themselves too — redacting already-clean text here is a safe
 * no-op, so double-redaction costs nothing.
 */
export async function callGemini(systemPrompt: string, userText: string, options: CallGeminiOptions = {}): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY not configured');

  const { clean } = redactPII(userText);

  // CLAUDE-ADMIN-AI.md Part 2 acceptance: "No raw customer row is ever in a
  // Gemini request payload (verify by logging the outgoing payload in
  // dev)." Dev-only — this is the redacted payload, post-boundary.
  if (process.env.NODE_ENV !== 'production') {
    console.log('[admin-ai] outgoing Gemini payload (post-redaction):', JSON.stringify({ systemPrompt, userText: clean }).slice(0, 2000));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

  try {
    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: clean }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxOutputTokens ?? 500,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini generateContent failed: ${res.status} ${errBody.slice(0, 200)}`);
    }

    const body = (await res.json()) as GeminiGenerateResponse;
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Gemini generateContent returned no text');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
