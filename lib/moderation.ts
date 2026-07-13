import 'server-only';

export type ModerationResult =
  | { flagged: false }
  | { flagged: true; categories: string[] }
  | { error: 'api_unavailable' };

export async function moderateBio(text: string): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fail-closed: no API key = treat as unavailable = block submission
    return { error: 'api_unavailable' };
  }

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { error: 'api_unavailable' };
  }

  if (!res.ok) return { error: 'api_unavailable' };

  const data = await res.json() as {
    results: Array<{ flagged: boolean; categories: Record<string, boolean> }>;
  };

  const result = data.results?.[0];
  if (!result) return { error: 'api_unavailable' };

  if (!result.flagged) return { flagged: false };

  const triggered = Object.entries(result.categories)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return { flagged: true, categories: triggered };
}
