import 'server-only';

export type ListingSuggestionInput = {
  name: string;
  productType: string;
  location?: string;
  description?: string;
  keywords?: string[];
  priceRange?: string;
};

export type ListingSuggestion = {
  title: string;
  description: string;
  category: string;
  tags: string[];
};

export type ListingSuggestionResult =
  | { available: true; provider: 'qwencloud'; model: string; suggestion: ListingSuggestion }
  | { available: false; provider: 'qwencloud'; reason: 'not_configured' | 'rate_limited' | 'unavailable' };

function parseSuggestion(content: string): ListingSuggestion | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  try {
    const parsed = JSON.parse(fenced) as Partial<ListingSuggestion>;
    if (!parsed.title || !parsed.description || !parsed.category || !Array.isArray(parsed.tags)) return null;
    return {
      title: String(parsed.title).trim().slice(0, 255),
      description: String(parsed.description).trim().slice(0, 5000),
      category: String(parsed.category).trim().slice(0, 100),
      tags: parsed.tags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    };
  } catch {
    return null;
  }
}

export async function generateListingSuggestion(input: ListingSuggestionInput): Promise<ListingSuggestionResult> {
  const apiKey = process.env.QWEN_API_KEY?.trim()
    || process.env.DASHSCOPE_API_KEY?.trim()
    || process.env.MODELSCOPE_API_KEY?.trim();
  if (!apiKey) return { available: false, provider: 'qwencloud', reason: 'not_configured' };

  const baseUrl = process.env.QWEN_BASE_URL?.trim()
    || process.env.DASHSCOPE_BASE_URL?.trim()
    || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  // Use the exact free-tier model identifier shown in Qwen Cloud.
  const primaryModel = process.env.QWEN_MODEL?.trim() || 'qwen-flash-2025-07-28';
  const fallbackModel = process.env.QWEN_FALLBACK_MODEL?.trim();
  const maxTokens = Math.min(1000, Math.max(100, Number.parseInt(process.env.QWEN_MAX_OUTPUT_TOKENS || '500', 10) || 500));
  const models = [...new Set([primaryModel, fallbackModel].filter(Boolean))] as string[];
  let sawRateLimit = false;

  for (const model of models) {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          {
            role: 'system',
            content: 'You help Malaysian tourism vendors prepare concise marketplace listings. Return only valid JSON with title, description, category, and tags. Do not invent unavailable facts, prices, opening hours, awards, or guarantees.',
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
        max_tokens: maxTokens,
      }),
      cache: 'no-store',
    });

    if (response.status === 429) {
      sawRateLimit = true;
      continue;
    }
    if (!response.ok) continue;

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    const suggestion = content ? parseSuggestion(content) : null;
    if (suggestion) return { available: true, provider: 'qwencloud', model, suggestion };
  }

  return { available: false, provider: 'qwencloud', reason: sawRateLimit ? 'rate_limited' : 'unavailable' };
}
