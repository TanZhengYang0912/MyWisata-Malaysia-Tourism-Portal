import 'server-only';
import { generateAiText, type AiProvider, type AiUnavailableReason } from '@/lib/ai/provider';

export type ContentSurface = 'business_profile' | 'outlet_page' | 'inbox_reply';

export type OutletHeroDraft = { title: string; body: string; cta?: string; seoDescription?: string };

export type ContentDraftResult =
  | { available: true; provider: AiProvider; model: string; draft: string | OutletHeroDraft }
  | { available: false; reason: AiUnavailableReason };

export function buildContentPrompt(surface: ContentSurface, context: Record<string, unknown>): string {
  const facts = JSON.stringify(context);
  if (surface === 'business_profile') {
    return `Write one polished public business profile description in plain text, 2 to 4 sentences and under 900 characters. Use only the supplied facts. Do not invent awards, locations, prices, opening hours, guarantees, or services. Keep the tone welcoming to Malaysia travellers. Return plain text only. Do not use a heading or quotation marks.\n\nFACTS:\n${facts}`;
  }
  if (surface === 'outlet_page') {
    return `Improve the hero section of this Malaysian tourism outlet's public page using only the supplied facts (outlet name, location, about text, amenities, products, and the vendor's current hero and SEO text). Make it specific to this outlet: mention what it actually offers and where it is when those facts exist; replace generic placeholder wording. Return strict JSON with exactly these keys: title, body, cta, seoDescription. The title must be under 80 characters, body under 360 characters, cta under 40 characters, and seoDescription under 160 characters. Do not invent prices, opening hours, awards, guarantees, amenities, or products not listed in the facts.\n\nFACTS:\n${facts}`;
  }
  return `Draft one helpful, concise reply to the traveller based only on the conversation below. Return plain text only, 1 to 3 short sentences. Do not invent prices, availability, opening hours, booking status, refunds, or policies. If the information is missing, politely say the team will confirm it. Do not mention that AI was used.\n\nCONVERSATION:\n${facts}`;
}

function stripFence(content: string): string {
  return content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim();
}

/** Models sometimes wrap the JSON object in prose; keep only the outermost object. */
function extractJsonObject(content: string): string {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  return start >= 0 && end > start ? content.slice(start, end + 1) : content;
}

export function parseContentDraft(surface: ContentSurface, content: string): string | OutletHeroDraft | null {
  const stripped = stripFence(content);
  if (!stripped) return null;
  if (surface !== 'outlet_page') return stripped.slice(0, surface === 'business_profile' ? 900 : 1200);

  try {
    const parsed = JSON.parse(extractJsonObject(stripped)) as { title?: unknown; body?: unknown; cta?: unknown; seoDescription?: unknown };
    if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string' || !parsed.title.trim() || !parsed.body.trim()) return null;
    return {
      title: parsed.title.trim().slice(0, 80),
      body: parsed.body.trim().slice(0, 360),
      cta: typeof parsed.cta === 'string' && parsed.cta.trim() ? parsed.cta.trim().slice(0, 40) : undefined,
      seoDescription: typeof parsed.seoDescription === 'string' && parsed.seoDescription.trim() ? parsed.seoDescription.trim().slice(0, 160) : undefined,
    };
  } catch {
    return null;
  }
}

export async function generateContentDraft(surface: ContentSurface, context: Record<string, unknown>): Promise<ContentDraftResult> {
  const prompt = buildContentPrompt(surface, context);
  const result = await generateAiText(
    'You are a careful writing assistant for MYLawatan, a Malaysian tourism platform. Ground every output in the supplied facts and never fabricate operational details.',
    prompt,
    // JSON mode stops the model from wrapping the hero object in prose, which
    // previously made parseContentDraft fail and surface as "AI unavailable".
    { provider: 'gemini', temperature: 0.35, maxTokens: surface === 'outlet_page' ? 500 : 450, json: surface === 'outlet_page' },
  );
  if (!result.available) return result;
  const draft = parseContentDraft(surface, result.content);
  if (!draft) return { available: false, reason: 'unavailable' };
  return { available: true, provider: result.provider, model: result.model, draft };
}
