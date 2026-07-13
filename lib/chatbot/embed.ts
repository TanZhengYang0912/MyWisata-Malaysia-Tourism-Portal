// P4 — Member 4: embeddings for the RAG chatbot. CLAUDE-PHASE2.md Feature A.
//
// Provider: Google Gemini's gemini-embedding-001, with outputDimensionality
// pinned to 768 via the request body (NOT OpenAI's 1536 the original spec
// assumed; see migration 014's Feature A note). process.env.LLM_API_KEY is a
// single Gemini API key used for both embedding and generation
// (lib/chatbot/generate.ts).
//
// ⚠️ text-embedding-004 (the model this was first built against) 404s as of
// this session — live-verified via the ListModels endpoint against the real
// API key, not assumed: it's gone from the v1beta model list entirely.
// gemini-embedding-001 is the current embedding model, native output 3072
// dims, but Matryoshka-truncatable to smaller sizes via
// `outputDimensionality` — confirmed 768 back from a live call. Gemini's
// available models are not a stable target; if this 404s again later,
// re-run ListModels (see the reindex route's error message, which surfaces
// the raw Gemini error) rather than guessing a new name.
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
const EMBED_TIMEOUT_MS = 10_000;
export const EMBEDDING_DIMENSIONS = 768;

interface GeminiEmbedResponse {
  embedding?: { values?: number[] };
}

/**
 * One embedding call. Throws on missing key, network failure, timeout, or a
 * malformed response — callers (lib/chatbot/retrieve.ts, the reindex route,
 * the KB editor's save handler) are all expected to catch this and degrade
 * gracefully rather than let it propagate to a user-facing 500.
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Gemini embedContent failed: ${res.status} ${errBody.slice(0, 200)}`);
    }

    const body = (await res.json()) as GeminiEmbedResponse;
    const values = body.embedding?.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Gemini embedContent returned an unexpected shape (${values?.length ?? 0} dims)`);
    }
    return values;
  } finally {
    clearTimeout(timeout);
  }
}
