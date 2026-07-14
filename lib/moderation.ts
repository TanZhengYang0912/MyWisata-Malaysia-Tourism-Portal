import 'server-only';

export type ModerationResult =
  | { flagged: false }
  | { flagged: true; categories: string[] }
  | { error: 'api_unavailable' };

export async function moderateBio(text: string): Promise<ModerationResult> {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) {
    return { error: 'api_unavailable' };
  }

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a content moderator for a Malaysia tourism platform. Analyze the bio text below and determine if it violates community guidelines (hate speech, explicit content, spam, harassment, or illegal activity). Respond with valid JSON only, no markdown. Format: {"flagged": boolean, "categories": string[]}\n\nBio: ${JSON.stringify(text)}`,
            }],
          }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    return { error: 'api_unavailable' };
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.error('[moderation] Gemini error', res.status, JSON.stringify(errBody));
    return { error: 'api_unavailable' };
  }

  try {
    const data = await res.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = JSON.parse(raw) as { flagged: boolean; categories?: string[] };
    if (parsed.flagged) {
      return { flagged: true, categories: parsed.categories ?? ['policy_violation'] };
    }
    return { flagged: false };
  } catch {
    return { error: 'api_unavailable' };
  }
}
