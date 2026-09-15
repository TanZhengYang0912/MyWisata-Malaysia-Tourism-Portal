import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripCopilotCandidate, TripWeatherSignal } from '../trip-copilot';
import type { NormalizedForecast } from '@/lib/weather/types';

const mocks = vi.hoisted(() => ({ callGemini: vi.fn(), getOpenMeteoForecast: vi.fn() }));
vi.mock('@/lib/admin-ai/gemini', () => ({ callGemini: mocks.callGemini }));
// trip-copilot.ts imports searchActivities from here at module scope; that
// module eagerly builds a browser Supabase client via backend/supabase.ts,
// which needs env vars unit tests don't have — mock it out (unused by these
// tests, which exercise generateTripSuggestions()/ruleBasedTripSuggestions()
// only).
vi.mock('@/backend/domains/catalogue', () => ({ searchActivities: vi.fn() }));
// Real network call otherwise — mocked so these tests are deterministic and
// offline. lib/weather/risk.ts's classification logic itself is NOT mocked
// (pure, deterministic — safe and more honest to exercise for real).
vi.mock('@/lib/weather/open-meteo', () => ({ getOpenMeteoForecast: mocks.getOpenMeteoForecast }));

const { generateTripSuggestions, ruleBasedTripSuggestions } = await import('../trip-copilot');

const TRIP = { name: 'Penang Weekend', startDate: '2026-08-15', endDate: '2026-08-17' };

function noForecast(date: string): NormalizedForecast {
  return {
    availability: 'unavailable', provider: 'open_meteo', latitude: 5.41, longitude: 100.33, timezone: 'Asia/Kuala_Lumpur',
    date, fetchedAt: new Date().toISOString(), stale: false, evidence: null, hours: [],
  };
}

function realForecast(date: string, weatherCode: number): NormalizedForecast {
  const stormy = weatherCode === 95;
  return {
    availability: 'forecast', provider: 'open_meteo', latitude: 5.41, longitude: 100.33, timezone: 'Asia/Kuala_Lumpur',
    date, fetchedAt: new Date().toISOString(), stale: false, hours: [],
    evidence: {
      weatherCode,
      temperatureMaxC: 31, temperatureMinC: 25, apparentTemperatureMaxC: 33,
      precipitationProbabilityMax: stormy ? 90 : 10,
      precipitationSumMm: stormy ? 20 : 0,
      windGustMaxKmh: 15,
      uvIndexMax: 6,
    },
  };
}

const CANDIDATES: TripCopilotCandidate[] = [
  { productId: 'p1', name: 'Penang Hill Funicular', category: 'Activity', price: 30, rating: 4.6, reviews: 120, description: 'Ride to the summit.', image: null, requiresBooking: true, state: 'Penang', isHiddenGem: false, lat: 5.4141, lng: 100.3288, weatherSensitivity: 'weather_sensitive' },
  { productId: 'p2', name: 'Asam Laksa', category: 'Food', price: 8, rating: 4.8, reviews: 300, description: 'Tangy fish broth noodles.', image: null, requiresBooking: false, state: 'Penang', isHiddenGem: false, lat: 5.42, lng: 100.33, weatherSensitivity: 'not_weather_sensitive' },
  { productId: 'p3', name: 'Kek Lok Si Temple', category: 'Activity', price: 0, rating: 4.5, reviews: 50, description: 'A large Buddhist temple.', image: null, requiresBooking: false, state: 'Penang', isHiddenGem: true, lat: 5.4, lng: 100.27, weatherSensitivity: 'unknown' },
];

describe('generateTripSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOpenMeteoForecast.mockImplementation(async (input: { date: string }) => noForecast(input.date));
  });

  it('never calls Gemini or the weather API when there are no real candidates', async () => {
    const result = await generateTripSuggestions(TRIP, [], 'en');

    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(mocks.getOpenMeteoForecast).not.toHaveBeenCalled();
    expect(result).toEqual({ suggestions: [], mode: 'no-candidates' });
  });

  it('accepts a well-formed LLM response and attaches the real product name', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      suggestions: [
        { productId: 'p1', message: 'Great views and a short ride up Penang Hill.' },
        { productId: 'p2', message: 'A must-try local dish, cheap and highly rated.' },
      ],
    }));

    const result = await generateTripSuggestions(TRIP, CANDIDATES, 'en');

    expect(result.mode).toBe('llm');
    expect(result.suggestions).toEqual([
      { productId: 'p1', productName: 'Penang Hill Funicular', message: 'Great views and a short ride up Penang Hill.' },
      { productId: 'p2', productName: 'Asam Laksa', message: 'A must-try local dish, cheap and highly rated.' },
    ]);
  });

  it('drops a suggestion citing a productId not in the candidates (hallucination guard)', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      suggestions: [
        { productId: 'p1', message: 'Real candidate.' },
        { productId: 'does-not-exist', message: 'Invented listing.' },
      ],
    }));

    const result = await generateTripSuggestions(TRIP, CANDIDATES, 'en');

    expect(result.mode).toBe('llm');
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].productId).toBe('p1');
  });

  it('falls back to rule-based when every suggestion fails grounding validation', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      suggestions: [{ productId: 'totally-made-up', message: 'Invented.' }],
    }));

    const result = await generateTripSuggestions(TRIP, CANDIDATES, 'en');

    expect(result.mode).toBe('rule-based');
    expect(result.suggestions.every((s) => CANDIDATES.some((c) => c.productId === s.productId))).toBe(true);
  });

  it('falls back to rule-based output when Gemini throws', async () => {
    mocks.callGemini.mockRejectedValue(new Error('Gemini generateContent failed: 503'));

    const result = await generateTripSuggestions(TRIP, CANDIDATES, 'en');

    expect(result.mode).toBe('rule-based');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('falls back to rule-based output when Gemini returns malformed JSON', async () => {
    mocks.callGemini.mockResolvedValue('not json at all');

    const result = await generateTripSuggestions(TRIP, CANDIDATES, 'en');

    expect(result.mode).toBe('rule-based');
  });

  it('falls back to rule-based output when Gemini returns JSON that fails schema validation', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ suggestions: [{ productId: 'p1' }] }));

    const result = await generateTripSuggestions(TRIP, CANDIDATES, 'en');

    expect(result.mode).toBe('rule-based');
  });

  it('caps at 5 suggestions even if the model returns more', async () => {
    const manyCandidates: TripCopilotCandidate[] = Array.from({ length: 8 }, (_, i) => ({
      productId: `p${i}`, name: `Listing ${i}`, category: 'Activity', price: 10, rating: 4.5, reviews: 10, description: '', image: null, requiresBooking: false, state: 'Penang', isHiddenGem: false, lat: 5.4, lng: 100.3, weatherSensitivity: 'unknown' as const,
    }));
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      suggestions: manyCandidates.map((c) => ({ productId: c.productId, message: 'fits' })),
    }));

    const result = await generateTripSuggestions(TRIP, manyCandidates, 'en');

    expect(result.suggestions).toHaveLength(5);
  });

  it('passes the requested language name into the system prompt', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ suggestions: [{ productId: 'p1', message: '槟城山很美' }] }));

    await generateTripSuggestions(TRIP, CANDIDATES, 'zh');

    expect(mocks.callGemini).toHaveBeenCalledWith(expect.stringContaining('Simplified Chinese'), expect.any(String), expect.any(Object));
  });

  it('sends only the real trip info, weather, and candidates to Gemini, nothing invented', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ suggestions: [] }));

    await generateTripSuggestions(TRIP, CANDIDATES, 'en').catch(() => undefined);

    const [, userText] = mocks.callGemini.mock.calls[0];
    const payload = JSON.parse(userText);
    expect(payload.trip).toEqual(TRIP);
    expect(payload.weather).toEqual({ days: [], hasHighRiskDay: false }); // no forecast mocked -> honestly empty
    expect(payload.candidates).toHaveLength(3);
    expect(payload.candidates[0].productId).toBe('p1');
    expect(payload.candidates[0].weatherSensitivity).toBe('weather_sensitive');
  });

  it('computes a real weather signal from the top candidate\'s own coordinate and passes it to Gemini', async () => {
    mocks.getOpenMeteoForecast.mockImplementation(async (input: { date: string }) => (
      input.date === '2026-08-16' ? realForecast(input.date, 95) : noForecast(input.date)
    ));
    mocks.callGemini.mockResolvedValue(JSON.stringify({ suggestions: [{ productId: 'p2', message: 'Indoor-friendly pick given the forecast.' }] }));

    await generateTripSuggestions(TRIP, CANDIDATES, 'en');

    expect(mocks.getOpenMeteoForecast).toHaveBeenCalledWith({ latitude: 5.4141, longitude: 100.3288, date: '2026-08-15' });
    expect(mocks.getOpenMeteoForecast).toHaveBeenCalledWith({ latitude: 5.4141, longitude: 100.3288, date: '2026-08-16' });
    expect(mocks.getOpenMeteoForecast).toHaveBeenCalledWith({ latitude: 5.4141, longitude: 100.3288, date: '2026-08-17' });

    const [, userText] = mocks.callGemini.mock.calls[0];
    const payload = JSON.parse(userText) as { weather: TripWeatherSignal };
    expect(payload.weather.hasHighRiskDay).toBe(true);
    expect(payload.weather.days).toEqual([{ date: '2026-08-16', level: 'high', reasons: ['thunderstorm', 'heavy_rain'] }]);
  });

  it('continues generating without weather info if the weather fetch throws', async () => {
    mocks.getOpenMeteoForecast.mockRejectedValue(new Error('network down'));
    mocks.callGemini.mockResolvedValue(JSON.stringify({ suggestions: [{ productId: 'p1', message: 'Still works.' }] }));

    const result = await generateTripSuggestions(TRIP, CANDIDATES, 'en');

    expect(result.mode).toBe('llm');
    const [, userText] = mocks.callGemini.mock.calls[0];
    expect(JSON.parse(userText).weather).toEqual({ days: [], hasHighRiskDay: false });
  });
});

describe('ruleBasedTripSuggestions', () => {
  it('every productId it references is a real candidate, ranked by rating when there is no weather risk', () => {
    const suggestions = ruleBasedTripSuggestions(CANDIDATES);

    expect(suggestions[0].productId).toBe('p2'); // highest rating (4.8)
    for (const suggestion of suggestions) {
      expect(CANDIDATES.some((c) => c.productId === suggestion.productId)).toBe(true);
    }
  });

  it('deprioritizes weather-sensitive candidates when a real high-risk day is given', () => {
    const weather: TripWeatherSignal = { days: [{ date: '2026-08-16', level: 'high', reasons: ['thunderstorm'] }], hasHighRiskDay: true };

    const suggestions = ruleBasedTripSuggestions(CANDIDATES, weather);

    // p1 (weather_sensitive) ranks last despite a higher rating than p3 (unknown).
    expect(suggestions.map((s) => s.productId)).toEqual(['p2', 'p3', 'p1']);
  });

  it('caps at 5 even with more candidates', () => {
    const manyCandidates: TripCopilotCandidate[] = Array.from({ length: 8 }, (_, i) => ({
      productId: `p${i}`, name: `Listing ${i}`, category: 'Activity', price: 10, rating: 4.5, reviews: 10, description: '', image: null, requiresBooking: false, state: 'Penang', isHiddenGem: false, lat: 5.4, lng: 100.3, weatherSensitivity: 'unknown' as const,
    }));

    expect(ruleBasedTripSuggestions(manyCandidates)).toHaveLength(5);
  });
});
