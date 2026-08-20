import 'server-only';

import type { TravelPreferences } from '@/lib/personalization/scorer';

export type PublicActivityForExplanation = {
  name: string;
  category: string;
  description: string;
  tags?: string[];
  price: number;
};

type DescribeFitInput = {
  preferences: TravelPreferences;
  activity: PublicActivityForExplanation;
};

export function buildFallbackFitCopy({ preferences, activity }: DescribeFitInput): string {
  const interest = preferences.interests[0]?.trim() || activity.category.toLowerCase();
  const budget = preferences.budgetRange.replaceAll('_', ' ');
  return `This matches your ${interest} interests and ${budget} budget.`;
}

function safeExplanation(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replaceAll(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 220);
}

/**
 * Gemini is advisory copy only. Its prompt deliberately contains no account,
 * KYC, device-location, or other private customer data.
 */
export async function describeFit(input: DescribeFitInput): Promise<string> {
  const fallback = buildFallbackFitCopy(input);
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) return fallback;

  try {
    const model = process.env.GEMINI_PERSONALIZATION_MODEL ?? process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
    const publicPayload = {
      preferences: {
        interests: input.preferences.interests,
        budgetRange: input.preferences.budgetRange,
        mobilityNeeds: input.preferences.mobilityNeeds,
        preferredRadiusKm: input.preferences.preferredRadiusKm,
      },
      activity: {
        name: input.activity.name,
        category: input.activity.category,
        description: input.activity.description,
        tags: input.activity.tags ?? [],
        priceRm: input.activity.price,
      },
    };
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Write one friendly sentence (maximum 220 characters) explaining why this public tourism activity suits these non-identifying travel-preference labels. Do not invent facts, do not mention private data, and return plain text only.\n\n${JSON.stringify(publicPayload)}` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 80 },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return fallback;
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return safeExplanation(data.candidates?.[0]?.content?.parts?.[0]?.text, fallback);
  } catch {
    return fallback;
  }
}
