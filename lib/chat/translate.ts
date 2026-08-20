// P4 — CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 3: on-demand per-message
// chat translation. Same Gemini provider/key/model/timeout shape as
// lib/chatbot/generate.ts (see that file's header for why
// gemini-flash-lite-latest specifically) — a short single-message task, not
// a reasoning-heavy one, and reusing the same call shape means any future
// model-swap only has to happen in one place's worth of muscle memory.

import { redactPII } from '@/lib/chatbot/pii';
import type { ChatLanguage } from '@/lib/chatbot/language';

const TRANSLATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';
const TRANSLATE_TIMEOUT_MS = 15_000;

const LANGUAGE_NAMES: Record<ChatLanguage, string> = {
  en: 'English',
  bm: 'Bahasa Melayu',
  zh: 'Simplified Chinese',
};

interface GeminiGenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Translates a single chat message into `targetLang`. Throws on missing
 * key, network failure, timeout, or an empty response — the caller
 * (app/api/chat/translate/route.ts) is required to catch this and return a
 * graceful "couldn't translate" error, never let it reach the chat UI as a
 * crash (guardrail from the spec: a translation failure must not break chat).
 */
export async function translateMessage(text: string, targetLang: ChatLanguage): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY not configured');

  // Same redaction boundary as every other outbound LLM call in this module
  // (lib/chatbot/pii.ts) — a chat message can contain a phone number or IC,
  // and this is the one place that text leaves the platform.
  const { clean } = redactPII(text);

  const prompt = `Translate the following chat message into ${LANGUAGE_NAMES[targetLang]}. Preserve the exact meaning and tone, and keep any numbers, prices, or dates exactly as written — do not convert or reinterpret them. Output ONLY the translation: no notes, no quotes, no explanation.\n\nMESSAGE:\n${clean}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);

  try {
    const res = await fetch(TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini generateContent failed: ${res.status} ${errBody.slice(0, 200)}`);
    }

    const body = (await res.json()) as GeminiGenerateResponse;
    const translated = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!translated) throw new Error('Gemini generateContent returned no text');

    return translated;
  } finally {
    clearTimeout(timeout);
  }
}
