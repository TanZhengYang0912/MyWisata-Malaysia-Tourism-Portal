// P4 — Member 4: Trip Copilot — Part 1 (candidate gathering only).
//
// Builds on the same catalogue query the trip planner's own map view already
// uses (searchActivities, backend/domains/catalogue.ts) — zero dependency on
// backend/domains/trips, which is still a cookie-based mock store under
// active rework by another contributor. Once the real trip-items backend
// lands, this slots in unchanged: only the later "apply to trip" wiring
// needs that contract.
//
// Same discipline as lib/affiliate/copilot.ts: every candidate here is a
// real, active (status='active', review_status='approved' — enforced by
// getActivities()), bookable-or-not catalogue listing. Nothing here is
// generated or invented — a later LLM phrasing layer may only choose among
// these, never add one of its own.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { searchActivities, type SearchFilters } from '@/backend/domains/catalogue';
import type { RealCategorySlug } from '@/lib/customer/discovery-categories';
import { callGemini } from '@/lib/admin-ai/gemini';
import type { ChatLanguage } from '@/lib/chatbot/language';
import { getTripDayDates } from '@/lib/customer/trip-planner';
import { getOpenMeteoForecast } from '@/lib/weather/open-meteo';
import { classifyWeatherSensitivity, evaluateForecastRisk, type WeatherSensitivity } from '@/lib/weather/risk';
import type { ForecastRiskLevel, ForecastRiskReason } from '@/lib/weather/types';

export interface TripCopilotCandidate {
  productId: string;
  name: string;
  category: string;
  categorySlug?: string;
  price: number;
  rating: number;
  reviews: number;
  description: string;
  image: string | null;
  requiresBooking: boolean;
  /** The listing's own place, else its representative outlet's state — same fallback searchActivities uses internally. */
  state: string | null;
  isHiddenGem: boolean;
  /** Real coordinate — the listing's own place, else its representative outlet's. Used as the weather-check anchor and never invented. */
  lat: number;
  lng: number;
  /** From lib/weather/risk.ts::classifyWeatherSensitivity() — the same real classifier the itinerary weather feature already uses. */
  weatherSensitivity: WeatherSensitivity;
}

export interface TripCopilotCandidateFilters {
  /** The trip's destination, when known. */
  state?: string | null;
  categorySlug?: RealCategorySlug | null;
  /** Listings already in the trip, or otherwise not worth re-suggesting. */
  excludeProductIds?: string[];
}

const CANDIDATE_CAP = 12;

export async function getTripCopilotCandidates(
  filters: TripCopilotCandidateFilters,
  db: SupabaseClient,
): Promise<TripCopilotCandidate[]> {
  const searchFilters: SearchFilters = {
    state: filters.state ?? null,
    categorySlug: filters.categorySlug ?? null,
    sort: 'rating_desc',
  };
  const results = await searchActivities(searchFilters, db);
  const exclude = new Set(filters.excludeProductIds ?? []);

  return results
    .filter((activity) => !exclude.has(activity.id))
    .slice(0, CANDIDATE_CAP)
    .map((activity) => ({
      productId: activity.id,
      name: activity.name,
      category: activity.category,
      categorySlug: activity.categorySlug,
      price: activity.price,
      rating: activity.rating,
      reviews: activity.reviews,
      description: activity.description,
      image: activity.image,
      requiresBooking: activity.requiresBooking,
      state: activity.place?.state ?? activity.outlet.state ?? null,
      isHiddenGem: activity.isHiddenGem ?? false,
      lat: activity.place?.lat ?? activity.outlet.lat,
      lng: activity.place?.lng ?? activity.outlet.lng,
      weatherSensitivity: classifyWeatherSensitivity(activity),
    }));
}

// ─── Part 2: suggestion generation ──────────────────────────────────────────
// Same hallucination-guard-by-construction discipline as
// lib/affiliate/copilot.ts::generateCopilotActions(): the LLM only picks
// among and phrases the real candidates it was given — every returned
// productId is independently re-checked against the candidate list after
// the fact, and anything that isn't a real match is silently dropped rather
// than shown. Falls back to a deterministic rule-based pick if Gemini is
// unavailable, returns invalid JSON, or nothing survives validation — the
// copilot must never be blank/broken just because the LLM is down.

export interface TripCopilotTripInfo {
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface TripSuggestion {
  productId: string;
  productName: string;
  message: string;
}

export interface TripSuggestionsResult {
  suggestions: TripSuggestion[];
  mode: 'llm' | 'rule-based' | 'no-candidates';
}

const MAX_SUGGESTIONS = 5;

// ─── Weather signal ──────────────────────────────────────────────────────────
// Reuses lib/weather/open-meteo.ts / risk.ts exactly as the itinerary weather
// feature does — same real Open-Meteo forecast, same deterministic risk
// classification, no reimplementation. getOpenMeteoForecast() itself returns
// availability:'unavailable_yet' beyond its ~15-day real forecast horizon, so
// a day this far out is simply omitted below, never guessed at.
//
// Anchored to the top-ranked candidate's own real coordinate — a trip has no
// destination field of its own (see Part 0 of the affiliate/budget-guard
// investigation; the same gap applies here), so the best honest anchor
// available is a real listing's real location, not an invented state centroid.
const MAX_WEATHER_DAYS = 15;

export interface TripDayWeatherRisk {
  date: string;
  level: ForecastRiskLevel;
  reasons: ForecastRiskReason[];
}

export interface TripWeatherSignal {
  /** One entry per real day in the trip's date range with an actual evaluable forecast — a day beyond the forecast horizon, or with incomplete evidence, is simply absent, never guessed. */
  days: TripDayWeatherRisk[];
  /** True only if a real day came back 'high' risk (thunderstorm or heavy rain) — the flag the generation layer uses to lean away from weather-sensitive picks. */
  hasHighRiskDay: boolean;
}

async function getTripWeatherSignal(trip: TripCopilotTripInfo, anchor: { lat: number; lng: number }): Promise<TripWeatherSignal> {
  const dates = getTripDayDates({ start_date: trip.startDate, end_date: trip.endDate }).slice(0, MAX_WEATHER_DAYS);
  if (dates.length === 0) return { days: [], hasHighRiskDay: false };

  const forecasts = await Promise.all(dates.map((date) => getOpenMeteoForecast({ latitude: anchor.lat, longitude: anchor.lng, date })));
  const days: TripDayWeatherRisk[] = [];
  for (let i = 0; i < dates.length; i += 1) {
    const risk = evaluateForecastRisk(forecasts[i]);
    if (risk.level === 'unknown') continue;
    days.push({ date: dates[i], level: risk.level, reasons: risk.reasons });
  }
  return { days, hasHighRiskDay: days.some((day) => day.level === 'high') };
}

// en/bm/zh mirrors lib/chatbot/language.ts's ChatLanguage — real multilingual
// generation is system-prompt-driven (Gemini follows the instruction
// natively), not a translation module. Same pattern as lib/affiliate/copilot.ts.
const LANGUAGE_NAME: Record<ChatLanguage, string> = {
  en: 'English',
  bm: 'Bahasa Melayu',
  zh: 'Simplified Chinese',
};

const suggestionSchema = z.object({
  productId: z.string(),
  message: z.string().min(1),
}).strict();
const llmResponseSchema = z.object({ suggestions: z.array(suggestionSchema) }).strict();

function extractJson(text: string): unknown {
  const stripped = text.replace(/```json\s*|```/g, '').trim();
  return JSON.parse(stripped);
}

function buildTripCopilotSystemPrompt(lang: ChatLanguage): string {
  return `You are a trip-planning assistant for a Malaysian tourism platform, MyWisata, helping a traveller build their itinerary.

Below is the trip's basic info, a REAL weather forecast signal, and a REAL list of candidate catalogue listings (already queried — treat every listing, forecast day, and reason as fact, never change or invent a name, price, rating, date, or id not present in it).

Pick up to ${MAX_SUGGESTIONS} candidates that best fit this trip and write one short, appealing reason for each — why it fits (location, category variety, rating, price, dates). The productId in every suggestion MUST be one of the ids in the candidates list — never invent one or reference a listing not given to you.

Weather: each candidate carries a real "weatherSensitivity" ('weather_sensitive' | 'not_weather_sensitive' | 'unknown'). If "weather.hasHighRiskDay" is true, real forecast data shows at least one real day in this trip's dates with a meaningful chance of storms or heavy rain (see "weather.days" for exactly which dates and why) — when choosing among otherwise-similar candidates, prefer ones that are NOT "weather_sensitive", and you may briefly mention the weather consideration in the message. NEVER state a specific forecast condition, date, temperature, or guarantee beyond exactly what "weather.days" contains, and never mention weather at all if "weather.days" is empty — that means no real forecast was available for this trip's dates, not that the weather is fine.

NEVER invent a listing, price, or rating not in the data below. If fewer than ${MAX_SUGGESTIONS} candidates genuinely fit, return fewer — never pad with invented ones.

All money amounts are already in Malaysian Ringgit — if you reference a price, write it as "RM12.50", never "$12.50" or another currency symbol.

Reply in ${LANGUAGE_NAME[lang]}, for every message field.

Respond with ONLY strict JSON, no markdown, no commentary, in this exact shape:
{"suggestions": [{"productId": "<one of the candidate ids>", "message": "<why this fits the trip, in the target language>"}]}`;
}

function validateSuggestions(raw: z.infer<typeof suggestionSchema>[], candidates: TripCopilotCandidate[]): TripSuggestion[] {
  const names = new Map(candidates.map((c) => [c.productId, c.name]));
  const validated: TripSuggestion[] = [];
  for (const item of raw) {
    const productName = names.get(item.productId);
    if (!productName) continue;
    validated.push({ productId: item.productId, productName, message: item.message });
  }
  return validated.slice(0, MAX_SUGGESTIONS);
}

/**
 * Deterministic fallback — always English (no translation available without
 * the LLM), the top real candidates by rating, same as
 * lib/affiliate/copilot.ts::ruleBasedCopilotActions(). When a real high-risk
 * weather day exists, weather-sensitive candidates are sorted after
 * non-weather-sensitive ones of otherwise-equal rank — deprioritized, never
 * excluded outright, since the risk may not cover every day of the trip.
 */
export function ruleBasedTripSuggestions(candidates: TripCopilotCandidate[], weather?: TripWeatherSignal): TripSuggestion[] {
  const avoidWeatherSensitive = weather?.hasHighRiskDay ?? false;
  return [...candidates]
    .sort((a, b) => {
      if (avoidWeatherSensitive) {
        const aRisky = a.weatherSensitivity === 'weather_sensitive';
        const bRisky = b.weatherSensitivity === 'weather_sensitive';
        if (aRisky !== bRisky) return aRisky ? 1 : -1;
      }
      return b.rating - a.rating || b.reviews - a.reviews;
    })
    .slice(0, MAX_SUGGESTIONS)
    .map((c) => ({
      productId: c.productId,
      productName: c.name,
      message: c.reviews > 0
        ? `${c.name} is highly rated (${c.rating}★, ${c.reviews} reviews) — a solid pick for your trip.`
        : `${c.name} is a real, bookable listing worth considering for your trip.`,
    }));
}

export async function generateTripSuggestions(
  trip: TripCopilotTripInfo,
  candidates: TripCopilotCandidate[],
  lang: ChatLanguage,
): Promise<TripSuggestionsResult> {
  if (candidates.length === 0) {
    return { suggestions: [], mode: 'no-candidates' };
  }

  const weather = await getTripWeatherSignal(trip, { lat: candidates[0].lat, lng: candidates[0].lng })
    .catch((error) => {
      console.error('[trip-copilot] weather signal failed, continuing without it', error instanceof Error ? error.message : error);
      return { days: [], hasHighRiskDay: false };
    });

  try {
    const payload = {
      trip,
      weather,
      candidates: candidates.map((c) => ({
        productId: c.productId,
        name: c.name,
        category: c.category,
        price: c.price,
        rating: c.rating,
        reviews: c.reviews,
        description: c.description,
        weatherSensitivity: c.weatherSensitivity,
      })),
    };
    const raw = await callGemini(buildTripCopilotSystemPrompt(lang), JSON.stringify(payload), { temperature: 0.5, maxOutputTokens: 500 });
    const parsed = llmResponseSchema.parse(extractJson(raw));
    const suggestions = validateSuggestions(parsed.suggestions, candidates);
    if (suggestions.length === 0) throw new Error('No suggestions survived grounding validation');
    return { suggestions, mode: 'llm' };
  } catch (error) {
    console.error('[trip-copilot] suggestion generation failed, using rule-based fallback', error instanceof Error ? error.message : error);
    return { suggestions: ruleBasedTripSuggestions(candidates, weather), mode: 'rule-based' };
  }
}
