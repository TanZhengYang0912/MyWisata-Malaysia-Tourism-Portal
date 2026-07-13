// P4 — Member 4: LLM generation for the RAG chatbot. CLAUDE-PHASE2.md
// Feature A. Same provider/key as lib/chatbot/embed.ts (Gemini,
// process.env.LLM_API_KEY) — model is Flash-tier, chosen for CLAUDE-PHASE2.md
// Section 2's "use a free/cheap tier" instruction.
//
// ⚠️ Live-verified against the real API key this session: gemini-2.0-flash
// returns 429 (zero free-tier quota for this key/project — not a transient
// rate limit, the error names the limit itself as 0), and gemini-2.5-flash /
// gemini-2.5-flash-lite both 404 ("no longer available to new users").
// gemini-flash-lite-latest and gemini-flash-latest both returned 200 in a
// live test; used the lite variant since it's the cheaper of the two and
// this is a short-answer FAQ bot, not a reasoning-heavy task. Google moves
// these aliases around — if this 404s or 429s again later, re-run the
// ListModels check (see lib/chatbot/embed.ts's note) rather than guessing.
export interface GenerateDoc {
  title: string;
  body: string;
}

const GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';
const GENERATE_TIMEOUT_MS = 15_000;

// Verbatim from CLAUDE-PHASE2.md Section 2 — the strictness here is what
// keeps the bot from hallucinating about money. Do not soften this.
const SYSTEM_PROMPT = `You are the support assistant for MyWisata, a Malaysian tourism platform.

Answer ONLY using the CONTEXT below. The context is the complete set of
facts you are allowed to use.

If the context does not contain the answer, reply with exactly:
NO_ANSWER

Never guess. Never invent policy, prices, timelines, or amounts.
Money, wallet, commission, and withdrawal questions must be answered
word-for-word from the context or not at all.

Be concise: 1-3 sentences. Plain English.`;

interface GeminiGenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Returns the model's answer, or null if it said NO_ANSWER (treated as "no
 * match" by the caller — same as retrieval finding nothing). Throws on
 * missing key, network failure, timeout, or a malformed response; the
 * caller (lib/chatbot/answer.ts) is required to catch this and fall back to
 * the keyword matcher — never let this reach the user as an error.
 */
export async function generateAnswer(question: string, docs: GenerateDoc[]): Promise<string | null> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY not configured');

  const context = docs.map((d) => `TITLE: ${d.title}\nBODY: ${d.body}`).join('\n\n');
  const userText = `CONTEXT:\n${context}\n\nQUESTION: ${question}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

  try {
    const res = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
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

    return text === 'NO_ANSWER' ? null : text;
  } finally {
    clearTimeout(timeout);
  }
}
