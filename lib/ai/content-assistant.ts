import 'server-only';
import { redactPII } from '@/lib/chatbot/pii';
import { generateAiText, type AiProvider, type AiUnavailableReason } from '@/lib/ai/provider';

export type ContentSurface = 'business_profile' | 'outlet_page' | 'inbox_reply';

export type OutletHeroDraft = { title: string; body: string; cta?: string };

export type ContentDraftResult =
  | { available: true; provider: AiProvider; model: string; draft: string | OutletHeroDraft }
  | { available: false; reason: AiUnavailableReason };

export function buildContentPrompt(surface: ContentSurface, context: Record<string, unknown>): string {
  const facts = JSON.stringify(context);
  if (surface === 'business_profile') {
    return `Write one polished public business profile description in plain text, 2 to 4 sentences and under 900 characters. Use only the supplied facts. Do not invent awards, locations, prices, opening hours, guarantees, or services. Keep the tone welcoming to Malaysia travellers. Return plain text only. Do not use a heading or quotation marks.\n\nFACTS:\n${facts}`;
  }
  if (surface === 'outlet_page') {
    return `Create concise hero copy for a Malaysian tourism outlet page using only the supplied facts. Return strict JSON with exactly these keys: title, body, cta. The title must be under 80 characters, body under 360 characters, and cta under 40 characters. Do not invent prices, opening hours, awards, guarantees, or products not listed in the facts.\n\nFACTS:\n${facts}`;
  }
  return `Draft one helpful, concise reply to the traveller based only on the conversation below. Return plain text only, 1 to 3 short sentences. Do not invent prices, availability, opening hours, booking status, refunds, or policies. If the information is missing, politely say the team will confirm it. Do not mention that AI was used.\n\nCONVERSATION:\n${facts}`;
}

function stripFence(content: string): string {
  return content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? content.trim();
}

export function parseContentDraft(surface: ContentSurface, content: string): string | OutletHeroDraft | null {
  const stripped = stripFence(content);
  if (!stripped) return null;
  if (surface !== 'outlet_page') return stripped.slice(0, surface === 'business_profile' ? 900 : 1200);

  try {
    const parsed = JSON.parse(stripped) as { title?: unknown; body?: unknown; cta?: unknown };
    if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string' || !parsed.title.trim() || !parsed.body.trim()) return null;
    return {
      title: parsed.title.trim().slice(0, 80),
      body: parsed.body.trim().slice(0, 360),
      cta: typeof parsed.cta === 'string' && parsed.cta.trim() ? parsed.cta.trim().slice(0, 40) : undefined,
    };
  } catch {
    return null;
  }
}

export async function generateContentDraft(surface: ContentSurface, context: Record<string, unknown>): Promise<ContentDraftResult> {
  const prompt = buildContentPrompt(surface, context);
  const safePrompt = redactPII(prompt).clean;
  const result = await generateAiText(
    'You are a careful writing assistant for MyLawatan, a Malaysian tourism platform. Ground every output in the supplied facts and never fabricate operational details.',
    safePrompt,
    { temperature: 0.35, maxTokens: surface === 'outlet_page' ? 350 : 450 },
  );
  if (!result.available) return result;
  const draft = parseContentDraft(surface, result.content);
  if (!draft) return { available: false, reason: 'unavailable' };
  return { available: true, provider: result.provider, model: result.model, draft };
}
