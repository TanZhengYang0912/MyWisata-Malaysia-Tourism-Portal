import 'server-only';
import { generateAiText, type AiProvider, type AiUnavailableReason } from '@/lib/ai/provider';

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
  | { available: true; provider: AiProvider; model: string; suggestion: ListingSuggestion }
  | { available: false; reason: AiUnavailableReason };

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
  const result = await generateAiText(
    'You help Malaysian tourism vendors prepare concise marketplace listings. Return only valid JSON with title, description, category, and tags. Do not invent unavailable facts, prices, opening hours, awards, or guarantees.',
    JSON.stringify(input),
    { temperature: 0.35, maxTokens: Number.parseInt(process.env.QWEN_MAX_OUTPUT_TOKENS || '500', 10) || 500 },
  );
  if (!result.available) return result;
  const suggestion = parseSuggestion(result.content);
  if (!suggestion) return { available: false, reason: 'unavailable' };
  return { available: true, provider: result.provider, model: result.model, suggestion };
}
