import "server-only";

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

import { prepareExternalText } from '@/lib/chatbot/pii';

const GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';
const GENERATE_TIMEOUT_MS = 15_000;

interface GeminiGenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export interface CallGeminiOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
  images?: GeminiInlineImage[];
}

export interface GeminiInlineImage {
  id: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
}

/**
 * Rejects unsafe system or user text before sending. Images remain blocked
 * until their contents can be checked without exposing identity documents.
 */
export async function callGemini(systemPrompt: string, userText: string, options: CallGeminiOptions = {}): Promise<string> {
  const prepared = prepareExternalText(userText);
  if (!prepared.allowed) throw new Error('sensitive_data_detected');
  if (options.images?.length) throw new Error('image_privacy_review_required');
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY not configured');
  const { clean, found } = prepared;
  const parts = [
    { text: clean },
    ...(options.images ?? []).flatMap((image) => [
      { text: `Photo ID: ${image.id}` },
      { inlineData: { mimeType: image.mimeType, data: image.data } },
    ]),
  ];

  // CLAUDE-ADMIN-AI.md Part 2 acceptance: "No raw customer row is ever in a
  // Gemini request payload (verify by logging the outgoing payload in
  // dev)." Dev-only — this is the redacted payload, post-boundary.
  if (process.env.NODE_ENV !== 'production') {
    console.log('[admin-ai] outgoing Gemini payload metadata:', JSON.stringify({
      systemPromptLength: systemPrompt.length,
      userTextLength: clean.length,
      piiDetected: found,
      imageCount: options.images?.length ?? 0,
      imageIds: options.images?.map((image) => image.id) ?? [],
      imageMimeTypes: options.images?.map((image) => image.mimeType) ?? [],
    }).slice(0, 2000));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

  try {
    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxOutputTokens ?? 500,
        },
      }),
      signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Gemini generateContent failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as GeminiGenerateResponse;
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Gemini generateContent returned no text');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
