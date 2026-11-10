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

import { prepareExternalText, prepareStaffQuestionText } from '@/lib/chatbot/pii';

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
  /**
   * 'staff' only for the Super Admin AI assistant (lib/admin-ai/orchestrate.ts):
   * its text is a staff question plus guide text and aggregate results, so
   * topic words like "KYC" are allowed. Every other caller sends user content
   * and keeps the default full check.
   */
  textSource?: 'user' | 'staff';
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
  const prepared = options.textSource === 'staff' ? prepareStaffQuestionText(userText) : prepareExternalText(userText);
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

// ── Function calling (the admin AI agent, lib/admin-ai/orchestrate.ts) ─────

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  [key: string]: unknown;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * One agent turn. Every text part and tool result in `contents` passes the
 * staff privacy check, so a tool result can never carry personal data out.
 * Returns the model's content exactly as sent (it may hold thought
 * signatures that must be echoed back on the next turn).
 */
export async function callGeminiAgent(
  systemPrompt: string,
  contents: GeminiContent[],
  tools: GeminiFunctionDeclaration[],
  options: { forceText?: boolean; maxOutputTokens?: number } = {},
): Promise<{ content: GeminiContent; text: string; calls: NonNullable<GeminiPart['functionCall']>[] }> {
  for (const content of contents) {
    for (const part of content.parts) {
      const outgoing = part.text ?? (part.functionResponse ? JSON.stringify(part.functionResponse.response) : null);
      if (content.role === 'user' && outgoing !== null && !prepareStaffQuestionText(outgoing).allowed) {
        throw new Error('sensitive_data_detected');
      }
    }
  }
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  try {
    const send = () => fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: options.forceText ? 'NONE' : 'AUTO' } },
        generationConfig: { temperature: 0.2, maxOutputTokens: options.maxOutputTokens ?? 600 },
      }),
      signal: controller.signal,
    });
    // The agent makes several calls per question; one retry absorbs a brief model overload.
    let res = await send();
    if (res.status === 503) res = await send();
    if (!res.ok) throw new Error(`Gemini generateContent failed: HTTP ${res.status}`);
    const body = (await res.json()) as { candidates?: { content?: GeminiContent }[] };
    const content = body.candidates?.[0]?.content;
    if (!content?.parts?.length) throw new Error('Gemini generateContent returned no content');
    const calls = content.parts.flatMap((part) => (part.functionCall ? [part.functionCall] : []));
    const text = content.parts.filter((part) => part.text && !part.thought).map((part) => part.text).join('').trim();
    if (!text && !calls.length) throw new Error('Gemini generateContent returned no text');
    return { content: { role: 'model', parts: content.parts }, text, calls };
  } finally {
    clearTimeout(timeout);
  }
}
