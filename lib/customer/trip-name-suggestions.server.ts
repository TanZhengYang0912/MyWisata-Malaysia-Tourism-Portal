import "server-only";

import { callGemini } from "@/lib/admin-ai/gemini";
import {
  fallbackTripNameSuggestions,
  parseTripNameSuggestions,
  resolveTripNameLocale,
  type TripDuration,
} from "@/lib/customer/trip-name";

export type TripNameSuggestionInput = {
  idea: string;
  startDate: string;
  endDate: string;
  duration: TripDuration;
  locale: "en" | "ms" | "zh-CN";
};

const TRIP_NAME_SYSTEM_PROMPT = `You name customer trips for a Malaysian tourism app.
Return only valid JSON in exactly this shape: {"suggestions":["name 1","name 2","name 3"]}.
Create exactly three distinct, natural titles in the requested locale, each no longer than 60 characters.
Use this exact locale mapping: en: English; ms: Bahasa Melayu; zh-CN: Simplified Chinese.
For zh-CN, every title must contain Simplified Chinese travel wording. Do not answer with English-only titles even when a place has an English name.
For ms, write the travel wording in Bahasa Melayu. Place names may keep their natural local spelling.
Use only the supplied idea, dates, and server-computed duration. Do not invent activities, bookings, prices, guarantees, dates, or duration.
Duration may be omitted. If included, it must exactly match the supplied days and nights.
Return plain text names without HTML, Markdown, commentary, or personal data.`;

export async function generateTripNameSuggestions(input: TripNameSuggestionInput) {
  const locale = resolveTripNameLocale(input.idea, input.locale);
  const localizedInput = { ...input, locale };
  const fallback = fallbackTripNameSuggestions(input.idea, input.duration, locale);
  try {
    const raw = await callGemini(
      TRIP_NAME_SYSTEM_PROMPT,
      JSON.stringify(localizedInput),
      { temperature: 0.55, maxOutputTokens: 180 },
    );
    const suggestions = parseTripNameSuggestions(raw, input.duration, locale);
    if (suggestions.length !== 3) return { suggestions: fallback, aiAvailable: false };
    return { suggestions, aiAvailable: true };
  } catch (error) {
    return { suggestions: fallback, aiAvailable: false, privacyBlocked: error instanceof Error && error.message === 'sensitive_data_detected' };
  }
}
