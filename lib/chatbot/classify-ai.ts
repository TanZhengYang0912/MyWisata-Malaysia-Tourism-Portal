// P4 — Member 4: AI ticket classification. CLAUDE-FIXES-2.md item 6 —
// "one of the three AI features the proposal promises."
//
// Same Gemini generation model already verified working for the chatbot
// (lib/chatbot/generate.ts) — gemini-flash-lite-latest. Much simpler call
// than the chatbot's: no retrieval, no grounding context, just a
// single-word category classification.
//
// Guardrails (CLAUDE-FIXES-2.md's own words):
//   - reply isn't exactly one of the six category words -> fall back
//   - no LLM_API_KEY, or any API error/timeout          -> fall back
// classifyTicketAI() never throws — every failure mode returns null, which
// classifyTicketSmart() below treats as "use the keyword classifier."

import { classifyTicket, type TicketCategory } from './classify';

const CLASSIFY_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';
const CLASSIFY_TIMEOUT_MS = 10_000;

const VALID_CATEGORIES: readonly TicketCategory[] = ['booking', 'payment', 'withdrawal', 'kyc', 'technical', 'affiliate', 'vendor', 'general'];

function buildPrompt(subject: string, body: string): string {
  return `Classify this support ticket into exactly ONE category.
Reply with only the category word, nothing else.

Categories:
- booking     : bookings, orders, time slots, QR codes, cancellations
- payment     : paying, cards, checkout failures, refunds
- withdrawal  : withdrawing money, payouts, bank details, wallet balance/top-up
- kyc         : identity verification, ID/passport documents, verification rejected or stuck
- technical   : app or website errors, bugs, crashes, pages not loading
- affiliate   : affiliate links, commission, referrals, sharing
- vendor      : vendors, shops, listings, becoming a vendor
- general     : anything else

Ticket:
Subject: ${subject}
Body: ${body}`;
}

interface GeminiGenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/** Returns the AI-classified category, or null on any failure — see the file header for the exact guardrail list. Never throws. */
export async function classifyTicketAI(subject: string, body: string): Promise<TicketCategory | null> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);

  try {
    const res = await fetch(CLASSIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(subject, body) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 10 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as GeminiGenerateResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
    if (!text) return null;

    return (VALID_CATEGORIES as readonly string[]).includes(text) ? (text as TicketCategory) : null;
  } catch (error) {
    console.error('[chatbot] AI ticket classification failed, falling back to keywords', error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface ClassifyTicketResult {
  category: TicketCategory;
  method: 'ai' | 'keyword';
}

/** Tries AI classification first, falls back to the keyword classifier (lib/chatbot/classify.ts) on any failure — the "safety net" (CLAUDE-FIXES-2.md's own words). */
export async function classifyTicketSmart(subject: string, body: string): Promise<ClassifyTicketResult> {
  const aiCategory = await classifyTicketAI(subject, body);
  if (aiCategory) return { category: aiCategory, method: 'ai' };
  return { category: classifyTicket(`${subject} ${body}`), method: 'keyword' };
}
