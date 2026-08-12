// P4 — Member 4: AI-drafted KB entries from chatbot gaps. CLAUDE-P4-EXTRAS-2.md
// Extra 5 — "the bot learns what it's bad at, and AI drafts the fix for the
// admin to approve." Same provider/key/model as lib/chatbot/generate.ts
// (Gemini, process.env.LLM_API_KEY, gemini-flash-lite-latest) — a different
// system prompt and response shape (a KB draft, not a grounded RAG answer),
// so it's its own function rather than a mode of generateAnswer().
//
// Advisory only, by construction: this returns a draft. Nothing in this
// file writes to chatbot_kb_documents — saving happens through the existing
// POST/PATCH /api/admin/chatbot/kb path (which already auto-embeds on save,
// per that route's own comment), reusing the admin's existing KB form. The
// [ADMIN: confirm …] placeholder instruction below is the actual integrity
// guarantee — it's what stops the model from inventing a number/policy
// instead of admitting it doesn't know one, not a UI label.

import { redactPII } from './pii';

const DRAFT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';
const DRAFT_TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `You are drafting a knowledge-base entry for MyWisata, a Malaysian tourism
booking platform's customer support bot.

A customer asked a question the bot could not answer well — either it had
no answer at all, or it gave an answer the customer marked unhelpful.
Draft a concise, accurate knowledge-base entry that would answer this
question well next time.

Rules — these are strict:
- Only state facts you can reasonably infer are generally true for a
  tourism booking platform (e.g. "bookings can typically be cancelled
  before the activity starts" is a reasonable inference; a specific
  cancellation window, fee percentage, or deadline is NOT — you cannot
  know that).
- Wherever a specific figure, deadline, percentage, or policy detail is
  needed and you do not actually know it from the context given, write a
  placeholder in EXACTLY this form: [ADMIN: confirm <what's needed>].
  Never invent a specific number, deadline, percentage, or policy detail —
  a placeholder is always correct where a fabricated fact is not.
- Be concise: the body should be 1-4 sentences.
- Also suggest 3-8 keywords for this entry — the exact words/short phrases a
  customer would type when asking this, for a keyword-fallback matcher (not
  a semantic search — literal word overlap). Lowercase, comma-separated, no
  duplicates, no full sentences.
- Respond in EXACTLY this format and nothing else, no markdown fences, no
  extra commentary:
TITLE: <a short title for this KB entry, phrased as a question>
BODY: <the KB entry body>
KEYWORDS: <comma-separated keywords>`;

export interface KbDraft {
  title: string;
  body: string;
  keywords: string[];
}

/**
 * Drafts a title + body for a new KB doc from a question the bot failed on.
 * `existingWeakAnswer` is the bot's current answer to this exact question,
 * if any (there is none for a fully-unanswered question — only for an
 * answered-but-marked-unhelpful one) — passed as extra context so the model
 * can improve on it rather than starting blind. Never throws: returns null
 * on any failure (missing key, network, timeout, malformed/unparseable
 * response) so the caller can show "couldn't draft one" instead of a 500 —
 * this is a nice-to-have admin tool, not a money or accuracy path.
 */
export async function draftKbEntry(question: string, existingWeakAnswer: string | null): Promise<KbDraft | null> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  // Same redaction boundary as generate.ts/embed.ts — the raw question may
  // contain PII (CLAUDE-ADMIN-AI.md Part 1, §7.3); nothing user-typed
  // reaches Gemini unredacted.
  const { clean: cleanQuestion } = redactPII(question);
  const userText = existingWeakAnswer
    ? `QUESTION: ${cleanQuestion}\n\nEXISTING (WEAK) ANSWER — the customer said this did not help, improve on it:\n${existingWeakAnswer}`
    : `QUESTION: ${cleanQuestion}\n\n(The bot had no answer at all for this one.)`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DRAFT_TIMEOUT_MS);

  try {
    const res = await fetch(DRAFT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;

    return parseDraft(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parses the strict "TITLE: ...\nBODY: ...\nKEYWORDS: ..." format the system
 * prompt requires. BODY may span multiple lines (everything between the
 * BODY: and KEYWORDS: markers), TITLE is always the first line. Title/body
 * are required — returns null (a draft failure) if the model didn't follow
 * that much of the format, never a half-parsed guess passed through as if
 * it were reliable. KEYWORDS is best-effort: a model that skips it still
 * yields a usable draft, just with an empty keyword list for the admin to
 * fill in themselves — losing keyword suggestions isn't worth discarding an
 * otherwise-good title+body.
 */
function parseDraft(text: string): KbDraft | null {
  const titleMatch = /^TITLE:\s*(.+)$/m.exec(text);
  const title = titleMatch?.[1]?.trim();
  const bodyStart = text.search(/^BODY:/m);
  if (!title || bodyStart === -1) return null;

  const keywordsStart = text.search(/^KEYWORDS:/m);
  const bodyRaw = keywordsStart > bodyStart ? text.slice(bodyStart, keywordsStart) : text.slice(bodyStart);
  const body = bodyRaw.replace(/^BODY:\s*/, '').trim();
  if (!body) return null;

  const keywords =
    keywordsStart === -1
      ? []
      : text
          .slice(keywordsStart)
          .replace(/^KEYWORDS:\s*/, '')
          .trim()
          .split(',')
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);

  return { title, body, keywords };
}
